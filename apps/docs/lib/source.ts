import { loader } from "fumadocs-core/source";
import { docs } from "collections/server";
import { openapi } from "@/lib/openapi";

// `basePath: "/docs"` est ajouté par Next à chaque lien : les URL de la source restent donc à la racine.
export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  plugins: [openapi.loaderPlugin()],
});
