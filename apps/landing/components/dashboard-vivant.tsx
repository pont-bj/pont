"use client";

import { AnimatePresence, motion, useInView, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE } from "./anim";

type Statut = "en_cours" | "reussi" | "rembourse";
interface Paiement { id: number; client: string; operateur: string; agregateur: string; montant: number; statut: Statut }

const CLIENTS = ["Awa K.", "Moussa D.", "Fifamè A.", "Koffi M.", "Aïcha S.", "Yao B.", "Mariam T.", "Sènami H.", "Ibrahim O.", "Grâce N."];
const OPERATEURS = [
  ["MTN Bénin", "FedaPay"], ["Moov Bénin", "Kkiapay"], ["Wave Sénégal", "PawaPay"], ["Orange CI", "PayDunya"],
  ["Togocel", "FedaPay"], ["MTN CI", "PawaPay"], ["Orange Sénégal", "PayDunya"], ["Airtel Congo", "PawaPay"],
] as const;
const MONTANTS = [2500, 5000, 7500, 10000, 12500, 15000, 25000, 35000, 50000];

function genere(id: number): Paiement {
  // Pseudo-aléatoire déterministe : identique côté serveur et client.
  const r = (n: number) => Math.abs(Math.sin(id * 9301 + n * 49297)) % 1;
  const [operateur, agregateur] = OPERATEURS[Math.floor(r(1) * OPERATEURS.length)] ?? OPERATEURS[0];
  return {
    id,
    client: CLIENTS[Math.floor(r(2) * CLIENTS.length)] ?? "Awa K.",
    operateur, agregateur,
    montant: MONTANTS[Math.floor(r(3) * MONTANTS.length)] ?? 5000,
    statut: "reussi",
  };
}

const BARRES = [42, 58, 36, 66, 74, 60];
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Auj."];
const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} XOF`;

const NOTIFS = [
  { cle: "paiement", fond: "bg-white", icone: "✓", iconeFond: "bg-green-100 text-green-700", titre: "Paiement confirmé", texte: "Vérifié auprès de l'agrégateur" },
  { cle: "retrait", fond: "bg-white", icone: "↺", iconeFond: "bg-indigo-50 text-indigo-fonce", titre: "Retrait refusé, fonds restitués", texte: "Solde intact, aucun double débit" },
  { cle: "agent", fond: "bg-[#0B0B12] text-white", icone: "✦", iconeFond: "bg-white/10 text-green-400", titre: "« Ajoute un portefeuille à mon appli »", texte: "Agent IA · recette Portefeuille installée" },
] as const;

export function DashboardVivant() {
  const zone = useRef<HTMLDivElement>(null);
  const actif = useInView(zone, { margin: "-10% 0px" });
  const { scrollYProgress } = useScroll({ target: zone, offset: ["start end", "start 25%"] });
  const progression = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const rotateX = useTransform(progression, [0, 1], [24, 0]);
  const scale = useTransform(progression, [0, 1], [0.9, 1]);
  const y = useTransform(progression, [0, 1], [60, 0]);

  const [paiements, setPaiements] = useState<Paiement[]>(() => [1, 2, 3, 4].map(genere));
  const [encaisse, setEncaisse] = useState(2_450_000);
  const [reussis, setReussis] = useState(1284);
  const [aujourdhui, setAujourdhui] = useState(68);
  const [notif, setNotif] = useState(0);
  const suivant = useRef(5);

  useEffect(() => {
    if (!actif) return;
    const minuteur = setInterval(() => {
      const p = { ...genere(suivant.current++), statut: "en_cours" as Statut };
      setPaiements((liste) => [p, ...liste].slice(0, 4));
      // Le statut ne passe à « réussi » qu'après vérification (comme Pont en vrai).
      setTimeout(() => {
        setPaiements((liste) => liste.map((x) => (x.id === p.id ? { ...x, statut: "reussi" } : x)));
        setEncaisse((v) => v + p.montant);
        setReussis((v) => v + 1);
        setAujourdhui((v) => Math.min(96, v + 2));
      }, 1400);
    }, 3200);
    const rotation = setInterval(() => setNotif((n) => (n + 1) % NOTIFS.length), 4200);
    return () => { clearInterval(minuteur); clearInterval(rotation); };
  }, [actif]);

  const n = NOTIFS[notif] ?? NOTIFS[0];

  return (
    <div ref={zone} className="relative mt-14 w-full [perspective:1600px]">
      <motion.div style={{ rotateX, scale, y }} className="origin-top rounded-[22px] bg-[#F5F6FF] p-2 shadow-[0_40px_120px_-40px_rgba(79,70,229,0.35)] sm:p-3">
        <div className="flex overflow-hidden rounded-2xl border border-indigo-100 bg-white text-left">
          {/* Barre latérale */}
          <aside className="hidden w-[200px] shrink-0 flex-col gap-1 border-r border-bordure bg-zinc-50 p-3 md:flex">
            <div className="mb-4 flex items-center gap-2 px-2 py-1.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo text-xs font-bold text-white">B</span>
              <span className="text-sm font-semibold">Boutique Awa</span>
            </div>
            {["Vue d'ensemble", "Paiements", "Retraits", "Agrégateurs", "Développeurs"].map((l, i) => (
              <span key={l} className={`rounded-lg px-3 py-2 text-[13px] ${i === 0 ? "bg-indigo-50 font-medium text-indigo-fonce" : "text-zinc-600"}`}>{l}</span>
            ))}
          </aside>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between border-b border-bordure px-4 py-3 sm:px-6">
              <span className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs text-zinc-400 sm:w-64">Rechercher un paiement…</span>
              <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" /><span className="relative h-1.5 w-1.5 rounded-full bg-amber-600" /></span>
                Mode test
              </span>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="font-titre text-lg font-semibold sm:text-xl">Vue d&apos;ensemble</h3>
                <span className="text-xs text-zinc-500">7 derniers jours</span>
              </div>

              <div className="grid grid-cols-3 divide-x divide-bordure rounded-xl border border-bordure">
                <Kpi libelle="Encaissé" valeur={fcfa(encaisse)} note="+12,4 %" vert />
                <Kpi libelle="Taux de succès" valeur="94,2 %" note={`${reussis.toLocaleString("fr-FR")} paiements réussis`} />
                <Kpi libelle="Retraits" valeur="640 000 XOF" note="42 envois · aucun échec" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
                <div className="rounded-xl border border-bordure p-4">
                  <p className="text-[13px] font-medium">Volume encaissé</p>
                  <div className="mt-4 flex h-32 items-end gap-2 sm:h-36">
                    {[...BARRES, aujourdhui].map((h, i) => (
                      <div key={i} className="flex h-full flex-1 flex-col items-center gap-1.5">
                        <div className="flex w-full flex-1 items-end">
                          <motion.div
                            className={`w-full rounded-md ${i === 6 ? "bg-indigo" : "bg-indigo-100"}`}
                            initial={{ height: "0%" }}
                            animate={actif ? { height: `${h}%` } : { height: "0%" }}
                            transition={{ duration: 1.2, ease: EASE, delay: i === 6 ? 0 : 0.3 + i * 0.07 }}
                          />
                        </div>
                        <span className={`text-[10px] ${i === 6 ? "font-medium text-indigo" : "text-zinc-400"}`}>{JOURS[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-bordure p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium">Derniers paiements</p>
                    <span className="flex items-center gap-1.5 text-[11px] text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />En direct</span>
                  </div>
                  <ul className="mt-2">
                    <AnimatePresence initial={false} mode="popLayout">
                      {paiements.map((p) => (
                        <motion.li
                          key={p.id}
                          layout
                          initial={{ opacity: 0, y: -16, backgroundColor: "rgba(238,242,255,1)" }}
                          animate={{ opacity: 1, y: 0, backgroundColor: "rgba(238,242,255,0)" }}
                          exit={{ opacity: 0, transition: { duration: 0.25 } }}
                          transition={{ duration: 0.7, ease: EASE, backgroundColor: { duration: 2 } }}
                          className="flex items-center gap-3 rounded-lg px-2 py-2"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600">
                            {p.client.split(" ").map((x) => x[0]).join("")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{p.client}</span>
                            <span className="block truncate text-[11px] text-zinc-500">{p.operateur} · via {p.agregateur}</span>
                          </span>
                          <span className="text-right">
                            <span className="block text-[13px] font-medium tabular-nums">{p.montant.toLocaleString("fr-FR")}</span>
                            <Badge statut={p.statut} />
                          </span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Notification flottante qui raconte ce qui se passe */}
      <div className="pointer-events-none absolute -top-6 right-2 z-10 sm:-right-4 sm:-top-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={n.cle}
            initial={{ opacity: 0, y: 16, scale: 0.94, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, scale: 0.97, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className={`flex max-w-[300px] items-center gap-3 rounded-2xl border border-black/5 px-4 py-3 shadow-[0_16px_40px_rgba(24,24,27,0.16)] ${n.fond}`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm ${n.iconeFond}`}>{n.icone}</span>
            <span className="text-left">
              <b className="block text-[13px] leading-snug">{n.titre}</b>
              <span className={`text-[11px] ${n.fond.includes("0B0B12") ? "text-zinc-400" : "text-zinc-500"}`}>{n.texte}</span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Kpi({ libelle, valeur, note, vert = false }: { libelle: string; valeur: string; note: string; vert?: boolean }) {
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <p className="truncate text-[11px] text-zinc-500 sm:text-xs">{libelle}</p>
      <motion.p key={valeur} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1 truncate font-titre text-sm font-semibold tabular-nums sm:text-2xl">
        {valeur}
      </motion.p>
      <p className={`mt-1 truncate text-[10px] sm:text-xs ${vert ? "text-green-700" : "text-zinc-500"}`}>{note}</p>
    </div>
  );
}

function Badge({ statut }: { statut: Statut }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={statut}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3 }}
        className={`mt-0.5 inline-block rounded-full px-1.5 py-px text-[10px] font-medium ${statut === "reussi" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
      >
        {statut === "reussi" ? "Réussi" : "Vérification…"}
      </motion.span>
    </AnimatePresence>
  );
}
