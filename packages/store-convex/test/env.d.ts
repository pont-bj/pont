// `import.meta.glob` est fourni par Vite (Vitest) ; déclaration minimale pour le typecheck.
interface ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}
