export function CarteAuth({ titre, texte, children }: { titre: string; texte: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-bordure bg-white p-8">
        <div className="mb-6 flex items-center gap-2">
          <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
            <path fill="#4F46E5" fillRule="evenodd" d="M8 6 H42 A14 14 0 0 1 56 20 V30 A14 14 0 0 1 42 44 H22 V58 H8 Z M22 34 H42 V22 A10 10 0 0 0 22 22 Z" />
          </svg>
          <span className="text-lg font-semibold">Pont</span>
        </div>
        <h1 className="text-xl font-semibold">{titre}</h1>
        <p className="mb-6 mt-1 text-sm text-zinc-500">{texte}</p>
        {children}
      </div>
    </main>
  );
}
