import type { PluginError } from "@/lib/pont";

/** Plugins défaillants : le serveur démarre quand même, l'erreur est montrée ici avec la marche à suivre. */
export function ErreursPlugins({ erreurs }: { erreurs: PluginError[] }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-800">
      <p className="font-semibold">{erreurs.length === 1 ? "Un agrégateur personnalisé n'a pas pu être chargé" : `${erreurs.length} agrégateurs personnalisés n'ont pas pu être chargés`}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {erreurs.map((erreur) => (
          <li key={erreur.dir}>
            <code className="rounded bg-white/70 px-1.5 py-0.5">{erreur.dir}</code> : {erreur.message}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-red-700">
        Corrigez le dossier dans <code className="rounded bg-white/70 px-1.5 py-0.5">plugins/</code> (ou regénérez-le avec <code className="rounded bg-white/70 px-1.5 py-0.5">pont provider new</code>), puis redémarrez le serveur : un nouveau dossier n'est lu qu'au démarrage.
      </p>
    </div>
  );
}

