"use client";

import { motion, useInView, useScroll, useSpring, useTransform } from "motion/react";
import Image from "next/image";
import { useRef } from "react";
import { EASE } from "./anim";
import { Symbole } from "./logo";

/** Défilement continu (deux copies côte à côte, translation de -50 %). */
export function Defilement({ children, duree = 30, inverse = false }: { children: React.ReactNode; duree?: number; inverse?: boolean }) {
  return (
    <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <motion.div
        className="flex w-max gap-4"
        animate={{ x: inverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration: duree, ease: "linear", repeat: Infinity }}
      >
        <div className="flex shrink-0 items-center gap-4">{children}</div>
        <div className="flex shrink-0 items-center gap-4" aria-hidden="true">{children}</div>
      </motion.div>
    </div>
  );
}

export function Logos({ logos }: { logos: { nom: string; src: string; l: number }[] }) {
  return (
    <Defilement duree={28}>
      {logos.map((a) => (
        <span key={a.nom} className="flex h-14 w-48 items-center justify-center rounded-2xl border border-bordure bg-white">
          <Image src={a.src} alt={a.nom} width={a.l} height={24} className="h-6 w-auto" />
        </span>
      ))}
    </Defilement>
  );
}

const AGREGATEURS_PONT = [
  { nom: "FedaPay", src: "/agregateurs/fedapay.svg", l: 110 },
  { nom: "PawaPay", src: "/agregateurs/pawapay.svg", l: 106 },
  { nom: "PayDunya", src: "/agregateurs/paydunya.png", l: 96 },
  { nom: "Kkiapay", src: "/agregateurs/kkiapay.svg", l: 120 },
];

// Demi-pont : tablier, arche, montants. La moitié droite est le miroir de la gauche.
function DemiPont() {
  const montants = [24, 56, 88, 120, 152, 184];
  const arche = (x: number) => 150 - (x / 196) * 92 + ((x / 196) * (1 - x / 196)) * 60; // approx. de la courbe
  return (
    <g>
      <rect x="0" y="40" width="196" height="12" rx="2" fill="currentColor" />
      <rect x="0" y="34" width="196" height="2" fill="currentColor" opacity="0.5" />
      <path d="M0 150 Q100 66 196 56" fill="none" stroke="currentColor" strokeWidth="12" />
      {montants.map((x) => <rect key={x} x={x - 4} y="52" width="8" height={Math.max(0, arche(x) - 58)} fill="currentColor" />)}
    </g>
  );
}

/** Le récit : deux rives séparées (le problème) que Pont relie au fil du scroll. */
export function PontRecit() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 90, damping: 28, mass: 0.5 });
  const gauche = useTransform(p, [0.05, 0.6], [-120, 0]);
  const droite = useTransform(p, [0.05, 0.6], [120, 0]);
  const cle = useTransform(p, [0.58, 0.72], [-120, 0]);
  const cleOpacite = useTransform(p, [0.58, 0.68], [0, 1]);
  const cleEchelle = useTransform(p, [0.58, 0.72], [0.6, 1]);
  const gaucheP = useTransform(p, [0.05, 0.6], ["-30%", "0%"]);
  const droiteP = useTransform(p, [0.05, 0.6], ["30%", "0%"]);
  const couleur = useTransform(p, [0.55, 0.7], ["#A1A1AA", "#09090B"]);
  const texte1 = useTransform(p, [0, 0.1, 0.4, 0.5], [0, 1, 1, 0]);
  const texte2 = useTransform(p, [0.62, 0.75], [0, 1]);
  const y2 = useTransform(p, [0.62, 0.75], [24, 0]);

  return (
    <section ref={ref} className="relative h-[260vh] bg-zinc-50" aria-label="Le problème et la solution">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-4">
        <div className="relative h-28 w-full max-w-[900px] text-center sm:h-32">
          <motion.p style={{ opacity: texte1 }} className="absolute inset-0 font-titre text-2xl font-medium leading-snug text-encre sm:text-4xl">
            Chaque agrégateur a son API, ses webhooks, ses statuts.<br />
            <span className="text-zinc-400">Chaque fintech construit son pont… à moitié.</span>
          </motion.p>
          <motion.p style={{ opacity: texte2, y: y2 }} className="absolute inset-0 font-titre text-2xl font-medium leading-snug sm:text-4xl">
            Pont relie les deux rives.<br />
            <span className="text-zinc-400">Une intégration, tous les agrégateurs, zéro friction.</span>
          </motion.p>
        </div>

        <div className="relative mt-16 aspect-[400/170] w-full max-w-[760px] sm:mt-20">
          <motion.svg viewBox="0 0 400 170" className="absolute inset-0 h-full w-full" style={{ color: couleur }} aria-hidden="true">
            <motion.g style={{ x: gauche }}><DemiPont /></motion.g>
            <motion.g style={{ x: droite }}><g transform="translate(400 0) scale(-1 1)"><DemiPont /></g></motion.g>
          </motion.svg>

          {/* Rive gauche : votre application, posée sur le tablier */}
          <motion.div style={{ x: gaucheP }} className="absolute inset-0"><div className="absolute bottom-[78%] left-[3%] flex items-center gap-2 rounded-xl border border-bordure bg-white px-2.5 py-1.5 shadow-sm sm:px-3 sm:py-2">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-encre text-[9px] font-bold text-white sm:h-7 sm:w-7 sm:text-[11px]">{"</>"}</span>
            <span className="text-[11px] font-semibold sm:text-sm">Votre app</span>
          </div></motion.div>

          {/* Rive droite : les opérateurs mobile money */}
          <motion.div style={{ x: droiteP }} className="absolute inset-0"><div className="absolute bottom-[78%] right-[3%] flex items-center gap-1 sm:gap-1.5" aria-label="FedaPay, PawaPay, PayDunya, Kkiapay">
            {AGREGATEURS_PONT.map((o) => (
              <span key={o.nom} className="grid h-6 w-12 place-items-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5 sm:h-9 sm:w-20">
                <Image src={o.src} alt={o.nom} width={o.l} height={24} className="h-full w-full object-contain px-1 py-1 sm:px-2 sm:py-2" />
              </span>
            ))}
          </div></motion.div>

          {/* Clé de voûte : le badge Pont qui relie les deux moitiés */}
          <motion.div
            style={{ y: cle, opacity: cleOpacite, scale: cleEchelle }}
            className="absolute left-1/2 top-[27%] -ml-6 -mt-6 grid h-12 w-12 place-items-center rounded-2xl bg-indigo shadow-[0_12px_30px_rgba(79,70,229,0.45)] ring-4 ring-zinc-50 sm:-ml-8 sm:-mt-8 sm:h-16 sm:w-16"
          >
            <Symbole className="h-6 w-auto sm:h-8" couleur="#FFFFFF" />
          </motion.div>
          <motion.span style={{ opacity: cleOpacite }} className="absolute left-1/2 top-[48%] -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-indigo sm:text-sm">
            Pont
          </motion.span>
        </div>
      </div>
    </section>
  );
}

/** Terminal qui se « tape » quand il entre dans l'écran. */
export function TerminalAnime() {
  const ref = useRef<HTMLDivElement>(null);
  const vu = useInView(ref, { once: true, margin: "-20% 0px" });
  const lignes: { t: string; c: string }[] = [
    { t: "$ npx pont init --agent", c: "text-zinc-100" },
    { t: "Stack détectée : Next.js (TypeScript)", c: "text-zinc-400" },
    { t: "+ lib/pont.ts", c: "text-indigo-300" },
    { t: "+ app/api/pont/hooks/[provider]/route.ts", c: "text-indigo-300" },
    { t: "+ app/api/pont/cron/route.ts", c: "text-indigo-300" },
    { t: "+ .env.local (sandbox)", c: "text-indigo-300" },
    { t: "+ AGENTS.md", c: "text-indigo-300" },
    { t: "✓ Premier paiement test réussi en 41 s", c: "font-semibold text-green-400" },
    { t: "", c: "" },
    { t: "$ npx pont add recipe wallet", c: "text-zinc-100" },
    { t: "+ lib/pont-wallet.ts (registre, portefeuilles, plafonds)", c: "text-indigo-300" },
  ];
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 1.1, ease: EASE }}
      className="overflow-x-auto rounded-2xl bg-[#0B0B12] p-6 font-mono text-[13px] leading-6 shadow-[0_30px_80px_-30px_rgba(79,70,229,0.5)] sm:p-7 sm:text-sm"
      aria-label="Exemple d'intégration en ligne de commande"
    >
      <div className="mb-5 flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /></div>
      {lignes.map((l, i) => (
        <motion.p
          key={i}
          className={`min-h-6 whitespace-pre ${l.c}`}
          initial={{ opacity: 0, x: -8 }}
          animate={vu ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.4, ease: EASE, delay: 0.4 + i * (i === 7 ? 0.5 : 0.28) }}
        >
          {l.t}
        </motion.p>
      ))}
      <motion.span
        className="inline-block h-4 w-2 translate-y-0.5 bg-zinc-300"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
    </motion.div>
  );
}

/** Les 4 étapes, reliées par une ligne qui se trace au scroll. */
export function Etapes({ etapes }: { etapes: readonly (readonly [string, string, string, string])[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const trace = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  return (
    <ol ref={ref} className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <motion.span style={{ scaleX: trace }} className="absolute -top-4 left-0 hidden h-px w-full origin-left bg-indigo lg:block" aria-hidden="true" />
      {etapes.map(([num, titre, texte], i) => (
        <motion.li
          key={num}
          initial={{ opacity: 0, y: 32, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.9, ease: EASE, delay: i * 0.12 }}
          whileHover={{ y: -4 }}
          className="group rounded-2xl border border-bordure bg-white p-6 transition-shadow hover:shadow-[0_16px_40px_-20px_rgba(79,70,229,0.4)]"
        >
          <span className="text-[13px] font-semibold text-indigo">{num}</span>
          <h3 className="mt-3 font-titre text-xl font-semibold">{titre}</h3>
          <p className="mt-3 text-sm leading-[21px] text-zinc-500">{texte}</p>
        </motion.li>
      ))}
    </ol>
  );
}
