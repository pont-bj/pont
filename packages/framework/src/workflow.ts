import { randomUUID } from "node:crypto";
import { PontError } from "@pont/core";

// Moteur de workflows avec compensation (modèle saga). Si une étape échoue, les étapes déjà réussies
// sont annulées dans l'ordre inverse. Exemple : retrait → [bloquer les fonds, envoyer à l'agrégateur] ;
// si l'envoi échoue, « bloquer les fonds » est compensé (fonds débloqués).

export interface StepContext {
  runId: string;
  /** Résultats des étapes précédentes, par nom d'étape. */
  results: Record<string, unknown>;
}

export interface WorkflowStep<TInput> {
  name: string;
  invoke(input: TInput, context: StepContext): Promise<unknown>;
  /** Annule l'effet de l'étape. Doit être idempotente : elle peut être rejouée après une panne. */
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

export type RunStatus = "succeeded" | "compensated" | "compensation_failed";

export interface WorkflowRun {
  id: string;
  workflow: string;
  idempotencyKey: string;
  status: RunStatus;
  steps: StepRecord[];
  /** Résultat final (succès) ou erreur d'origine (échec). */
  output?: Record<string, unknown>;
  error?: string;
  createdAt: number;
}

export interface WorkflowRunStore {
  get(workflow: string, idempotencyKey: string): Promise<WorkflowRun | null>;
  save(run: WorkflowRun): Promise<void>;
}

export class MemoryWorkflowRunStore implements WorkflowRunStore {
  private readonly runs = new Map<string, WorkflowRun>();

  async get(workflow: string, idempotencyKey: string): Promise<WorkflowRun | null> {
    const run = this.runs.get(`${workflow}:${idempotencyKey}`);
    return run ? structuredClone(run) : null;
  }

  async save(run: WorkflowRun): Promise<void> {
    this.runs.set(`${run.workflow}:${run.idempotencyKey}`, structuredClone(run));
  }
}

export interface Workflow<TInput> {
  name: string;
  run(input: TInput, options: { idempotencyKey: string; store: WorkflowRunStore; now?: () => number }): Promise<WorkflowRun>;
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
      // Idempotence : une même clé rejoue le résultat enregistré, sans réexécuter les étapes.
      const existing = await options.store.get(name, options.idempotencyKey);
      if (existing) return existing;

      const run: WorkflowRun = { id: `wfr_${randomUUID().replace(/-/g, "")}`, workflow: name, idempotencyKey: options.idempotencyKey, status: "succeeded", steps: [], createdAt: now() };
      const context: StepContext = { runId: run.id, results: {} };
      const done: Array<{ step: WorkflowStep<TInput>; output: unknown }> = [];

      for (const step of steps) {
        try {
          const output = await step.invoke(input, context);
          context.results[step.name] = output;
          done.push({ step, output });
          run.steps.push({ name: step.name, status: "succeeded", output, at: now() });
        } catch (error) {
          run.steps.push({ name: step.name, status: "failed", error: message(error), at: now() });
          run.error = message(error);
          run.status = "compensated";
          // Compensation en ordre inverse ; on continue même si l'une échoue, pour annuler le maximum.
          for (const { step: previous, output } of [...done].reverse()) {
            if (!previous.compensate) continue;
            const record = run.steps.find((s) => s.name === previous.name)!;
            try {
              await previous.compensate(input, output, context);
              record.status = "compensated";
            } catch (compensationError) {
              record.status = "compensation_failed";
              record.error = message(compensationError);
              run.status = "compensation_failed";
            }
          }
          await options.store.save(run);
          return run;
        }
      }
      run.output = context.results;
      await options.store.save(run);
      return run;
    },
  };
}
