import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Servi sous /docs par défaut, à la racine avec DOCS_BASE_PATH=root (voir lib/base-path.ts) : seul préfixe à connaître pour le monter derrière la landing (voir content/docs/guides/monter-sous-la-landing.mdx).
  ...(process.env.DOCS_BASE_PATH === "root" ? {} : { basePath: "/docs" }),
};

export default withMDX(config);
