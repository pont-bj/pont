import { estUrlNonPublique } from "@/lib/identite";

export const URL_GUIDE_PRODUCTION = "https://docs.pont.aboudouzinsou.com/guides/mise-en-production";

/** Bandeau ambre : l'adresse publique du serveur n'est pas joignable par un agrégateur (localhost, réseau privé, HTTP). */
export function AvertissementUrlPublique({ adresse }: { adresse: string | null }) {
  if (adresse === null || !estUrlNonPublique(adresse)) return null;
  let origine = adresse;
  try {
    origine = new URL(adresse).origin;
  } catch {
    /* adresse illisible : affichée telle quelle */
  }
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-[10px] bg-[#fffbeb] px-4 py-3 text-sm text-[#78350f]">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
        <path d="M8 2 1.5 13.5h13L8 2Z" />
        <path d="M8 6.5v3M8 11.5v.01" />
      </svg>
      <p className="flex-1">
        <span className="font-semibold">Les agrégateurs ne peuvent pas joindre cette adresse :</span> <code className="rounded bg-white/70 px-1.5 py-0.5">{origine}</code>. En production, définissez <code className="rounded bg-white/70 px-1.5 py-0.5">PONT_PUBLIC_URL</code> avec une adresse en HTTPS joignable depuis Internet.{" "}
        <a href={URL_GUIDE_PRODUCTION} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
          Guide de mise en production
        </a>
      </p>
    </div>
  );
}
