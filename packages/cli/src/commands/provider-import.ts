import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchSpecText, formatReport, importOpenApi, parseSpecText } from "../provider/openapi.js";
import { parseProviderSpec } from "../provider/spec.js";

export interface ProviderImportOptions {
  cwd: string;
  /** URL https ou chemin d'un fichier OpenAPI 3 (JSON ou YAML). */
  source: string;
  /** Fichier du brouillon (défaut : `./<id>.draft.json`). */
  out?: string;
  force: boolean;
  log: (line: string) => void;
  fetchFn?: typeof fetch;
}

export interface ProviderImportResult {
  ok: boolean;
  file?: string;
  errors: string[];
}

/** `pont provider import <spec>` : lit la spécification OpenAPI de l'agrégateur et écrit un brouillon, sans rien inventer. */
export async function runProviderImport(options: ProviderImportOptions): Promise<ProviderImportResult> {
  const { log } = options;
  try {
    const raw = /^https?:\/\//.test(options.source)
      ? await fetchSpecText(options.source, options.fetchFn)
      : existsSync(resolve(options.cwd, options.source))
        ? readFileSync(resolve(options.cwd, options.source), "utf8")
        : (() => {
            throw new Error(`Fichier introuvable : ${options.source}`);
          })();
    const { draft, report } = importOpenApi(await parseSpecText(raw));
    const file = resolve(options.cwd, options.out ?? `${String(draft["id"])}.draft.json`);
    if (existsSync(file) && !options.force) return { ok: false, errors: [`${file} existe déjà : ajoutez --force ou choisissez --out.`] };
    writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`);
    log(`Brouillon écrit : ${file}`);
    for (const line of formatReport(report)) log(line);
    const check = parseProviderSpec(draft);
    log("");
    if (check.ok) log(`Le brouillon est complet. Générez l'adaptateur : pont provider new --from ${file}`);
    else {
      log("Le brouillon n'est pas encore valide (normal) : complétez-le, puis générez l'adaptateur avec");
      log(`  pont provider new --from ${file}`);
    }
    return { ok: true, file, errors: [] };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
