import { randomUUID } from "node:crypto";
import { PontError } from "@pont/core";

// Moteur de workflows durables avec compensation (modèle saga).
// - Chaque étape est enregistrée dès qu'elle se termine : après un arrêt du serveur, une nouvelle exécution
//   avec la même clé d'idempotence reprend là où l'on s'était arrêté (étapes réussies non rejouées).
// - Un bail (verrou à durée limitée) empêche deux exécutions simultanées d'une même clé.
// - Si une étape échoue, les étapes réussies sont compensées en ordre inverse.
// Les étapes et compensations doivent être idempotentes : utiliser `context.idempotencyKey(step)`
// pour tout appel externe (paiement, écriture au registre).

export interface StepContext {
  runId: string;
  /** Résultats des étapes précédentes, par nom d'étape (valeurs JSON). */
  results: Record<string, unknown>;
  /** Clé d'idempotence stable pour un appel externe fait par cette étape. */
  idempotencyKey(step: string): string;
}

export interface WorkflowStep<TInput> {
  name: string;
  /** Doit renvoyer une valeur sérialisable en JSON (elle est persistée). */
  invoke(input: TInput, context: StepContext): Promise<unknown>;
  /** Annule l'effet de l'étape. Doit être idempotente : elle peut être rejouée après un arrêt. */
  compensate?(input: TInput, output: unknown, context: StepContext): Promise<void>;
}

export type StepStatus = "succeeded" | "failed" | "compensated" | "compensation_failed";

export interface StepRecord {
  name: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  at: number;
}

export type RunStatus = "running" | "compensating" | "succeeded" | "compensated" | "compensation_failed";

export interface WorkflowRun {
  id: string;
  workflow: string;
  idempotencyKey: string;
  status: RunStatus;
  /** Entrée persistée, pour reprendre une exécution interrompue. */
  input: unknown;
  steps: StepRecord[];
  output?: Record<string, unknown>;
  error?: string;
  /** Fin du bail : au-delà, une autre exécution peut reprendre ce run. */
  leaseUntil: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRunStore {
  get(workflow: string, idempotencyKey: string): Promise<WorkflowRun | null>;
  /** Crée le run s'il n'existe pas (atomique). Renvoie false si la clé existe déjà. */
  create(run: WorkflowRun): Promise<boolean>;
  /**
   * Prend le bail d'un run existant si personne ne le détient (`leaseUntil` <= now) ou si on le détient déjà
   * (`expectedLeaseUntil` identique). Atomique. Renvoie le run mis à jour, ou null si le bail est détenu ailleurs.
   */
  acquire(workflow: string, idempotencyKey: string, now: number, leaseUntil: number): Promise<WorkflowRun | null>;
  /** Enregistre l'avancement (le détenteur du bail est seul à écrire). */
  save(run: WorkflowRun): Promise<void>;
}

const FINAL: ReadonlySet<RunStatus> = new Set(["succeeded", "compensated", "compensation_failed"]);

export class MemoryWorkflowRunStore implements WorkflowRunStore {
  private readonly runs = new Map<string, WorkflowRun>();

  async get(workflow: string, idempotencyKey: string): Promise<WorkflowRun | null> {
    const run = this.runs.get(`${workflow}:${idempotencyKey}`);
    return run ? structuredClone(run) : null;
  }

  async create(run: WorkflowRun): Promise<boolean> {
    const key = `${run.workflow}:${run.idempotencyKey}`;
    if (this.runs.has(key)) return false;
    this.runs.set(key, structuredClone(run));
    return true;
  }

  async acquire(workflow: string, idempotencyKey: string, now: number, leaseUntil: number): Promise<WorkflowRun | null> {
    const run = this.runs.get(`${workflow}:${idempotencyKey}`);
    if (!run || FINAL.has(run.status) || run.leaseUntil > now) return null;
    run.leaseUntil = leaseUntil;
    run.updatedAt = now;
    return structuredClone(run);
  }

  async save(run: WorkflowRun): Promise<void> {
    this.runs.set(`${run.workflow}:${run.idempotencyKey}`, structuredClone(run));
  }
}

export interface RunOptions {
  idempotencyKey: string;
  store: WorkflowRunStore;
  now?: () => number;
  /** Durée du bail (ms). Doit couvrir l'étape la plus longue. Défaut : 60 s. */
  leaseMs?: number;
}

export interface Workflow<TInput> {
  name: string;
  /** Exécute, ou reprend un run interrompu dont le bail a expiré. */
  run(input: TInput, options: RunOptions): Promise<WorkflowRun>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWorkflow<TInput>(name: string, steps: Array<WorkflowStep<TInput>>): Workflow<TInput> {
  if (steps.length === 0) throw new PontError("configuration_error", `Workflow « ${name} » sans étape.`);
  const names = new Set<string>();
  for (const step of steps) {
    if (names.has(step.name)) throw new PontError("configuration_error", `Étape « ${step.name} » en double dans « ${name} ».`);
    names.add(step.name);
  }

  return {
    name,
    async run(input, options) {
      const now = options.now ?? Date.now;
      const leaseMs = options.leaseMs ?? 60_000;

      // 1. Obtenir le run : le créer, ou reprendre un run interrompu, ou rendre un run déjà terminé.
      let run = await options.store.get(name, options.idempotencyKey);
      if (run && FINAL.has(run.status)) return run;
      if (!run) {
        const fresh: WorkflowRun = {
          id: `wfr_${randomUUID().replace(/-/g, "")}`,
          workflow: name,
          idempotencyKey: options.idempotencyKey,
          status: "running",
          input,
          steps: [],
          leaseUntil: now() + leaseMs,
          createdAt: now(),
          updatedAt: now(),
        };
        if (await options.store.create(fresh)) {
          run = fresh;
        } else {
          run = await options.store.get(name, options.idempotencyKey);
          if (run && FINAL.has(run.status)) return run;
          throw new PontError("idempotency_conflict", `Workflow « ${name} » déjà en cours pour cette clé.`);
        }
      } else {
        const acquired = await options.store.acquire(name, options.idempotencyKey, now(), now() + leaseMs);
        if (!acquired) throw new PontError("idempotency_conflict", `Workflow « ${name} » déjà en cours pour cette clé.`);
        run = acquired;
      }

      // Reprise : l'entrée d'origine fait foi (pas celle de l'appel de reprise).
      const runInput = run.input as TInput;
      const context: StepContext = {
        runId: run.id,
        results: {},
        idempotencyKey: (step) => `${name}:${run!.idempotencyKey}:${step}`,
      };
      for (const record of run.steps) if (record.status === "succeeded") context.results[record.name] = record.output;

      const persist = async (patch: Partial<WorkflowRun>) => {
        Object.assign(run!, patch, { updatedAt: now(), leaseUntil: FINAL.has(patch.status ?? run!.status) ? 0 : now() + leaseMs });
        await options.store.save(run!);
      };

      // 2. Avancer (sauf si l'on reprend une compensation interrompue).
      if (run.status === "running") {
        for (const step of steps) {
          const record = run.steps.find((r) => r.name === step.name);
          if (record?.status === "succeeded") continue;
          try {
            const output = await step.invoke(runInput, context);
            context.results[step.name] = output;
            run.steps.push({ name: step.name, status: "succeeded", output, at: now() });
            await persist({});
          } catch (error) {
            run.steps.push({ name: step.name, status: "failed", error: message(error), at: now() });
            await persist({ status: "compensating", error: message(error) });
            break;
          }
        }
        if (run.status === "running") {
          await persist({ status: "succeeded", output: context.results });
          return run;
        }
      }

      // 3. Compenser en ordre inverse les étapes réussies, en continuant même si l'une échoue.
      let failed = false;
      for (const step of [...steps].reverse()) {
        const record = run.steps.find((r) => r.name === step.name);
        if (!record) continue;
        if (record.status === "compensation_failed") failed = true;
        if (record.status !== "succeeded" || !step.compensate) continue;
        try {
          await step.compensate(runInput, record.output, context);
          record.status = "compensated";
        } catch (compensationError) {
          record.status = "compensation_failed";
          record.error = message(compensationError);
          failed = true;
        }
        await persist({});
      }
      await persist({ status: failed ? "compensation_failed" : "compensated" });
      return run;
    },
  };
}
