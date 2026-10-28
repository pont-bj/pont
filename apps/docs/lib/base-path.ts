/** `/docs` derrière la landing (par défaut) ; `DOCS_BASE_PATH=root` pour un domaine dédié (docs.pont.aboudouzinsou.com). */
export const BASE_PATH = process.env.DOCS_BASE_PATH === "root" ? "" : "/docs";
