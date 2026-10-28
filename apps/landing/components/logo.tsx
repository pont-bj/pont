const P = "M8 6 H42 A14 14 0 0 1 56 20 V30 A14 14 0 0 1 42 44 H22 V58 H8 Z M22 34 H42 V22 A10 10 0 0 0 22 22 Z";

export function Symbole({ className, couleur = "#4F46E5" }: { className?: string; couleur?: string }) {
  return (
    <svg viewBox="8 6 48 52" className={className} aria-hidden="true">
      <path fill={couleur} fillRule="evenodd" d={P} />
    </svg>
  );
}

/** Logotype : le symbole tient lieu de P, suivi de « ont ». */
export function Logotype({ sombre = false, taille = "text-2xl" }: { sombre?: boolean; taille?: string }) {
  return (
    <span className={`inline-flex items-end font-titre font-semibold leading-none ${taille}`} aria-label="Pont">
      <Symbole className="h-[0.72em] w-auto translate-y-[-0.02em]" couleur={sombre ? "#6366F1" : "#4F46E5"} />
      <span className={`ml-[0.03em] ${sombre ? "text-white" : "text-encre"}`} aria-hidden="true">ont</span>
    </span>
  );
}
