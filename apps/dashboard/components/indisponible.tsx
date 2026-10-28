export function Indisponible({ titre }: { titre: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-bordure bg-white px-6 py-10 text-center">
      <h2 className="text-lg font-semibold">{titre} n'est pas disponible avec ce stockage</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
        Le registre en partie double s'appuie sur PostgreSQL. Relancez l'installation avec <code className="rounded bg-zinc-100 px-1.5 py-0.5">./setup.sh --store postgres</code> ou renseignez votre base dans <code className="rounded bg-zinc-100 px-1.5 py-0.5">DATABASE_URL</code>.
      </p>
    </div>
  );
}
