"use client";

import { animate, motion, MotionConfig, useInView, useMotionValue, useScroll, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Courbe « Apple » : départ franc, arrivée très douce. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export function Mouvement({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.9, ease: EASE }}>{children}</MotionConfig>;
}

/** Apparition au scroll : montée, flou qui se dissipe, opacité. */
export function Revele({ children, delai = 0, className, as = "div" }: { children: React.ReactNode; delai?: number; className?: string; as?: "div" | "li" | "p" | "h2" }) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 1, ease: EASE, delay: delai }}
    >
      {children}
    </Comp>
  );
}

/** Titre révélé mot par mot. */
export function MotsReveles({ texte, className, delai = 0 }: { texte: string; className?: string; delai?: number }) {
  const mots = texte.split(" ");
  return (
    <h1 className={className} aria-label={texte}>
      {mots.map((mot, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden="true">
          <motion.span
            className="inline-block"
            initial={{ y: "105%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            transition={{ duration: 1.1, ease: EASE, delay: delai + i * 0.07 }}
          >
            {mot}
            {i < mots.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

/** Nombre qui s'incrémente quand il entre dans l'écran. */
export function Compte({ vers, format = (n: number) => Math.round(n).toLocaleString("fr-FR"), duree = 1.6 }: { vers: number; format?: (n: number) => string; duree?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const vu = useInView(ref, { once: true });
  const valeur = useMotionValue(0);
  const [texte, setTexte] = useState(format(0));
  useEffect(() => valeur.on("change", (v) => setTexte(format(v))), [valeur, format]);
  useEffect(() => {
    if (!vu) return;
    const c = animate(valeur, vers, { duration: duree, ease: EASE });
    return () => c.stop();
  }, [vu, vers, valeur, duree]);
  return <span ref={ref} className="tabular-nums">{texte}</span>;
}

/** Texte qui « s'allume » mot par mot au fil du scroll. */
export function TexteScroll({ texte, className }: { texte: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const mots = texte.split(" ");
  return (
    <p ref={ref} className={className}>
      {mots.map((mot, i) => (
        <Mot key={i} progression={scrollYProgress} debut={i / mots.length} fin={(i + 1) / mots.length}>{mot}</Mot>
      ))}
    </p>
  );
}

function Mot({ children, progression, debut, fin }: { children: string; progression: MotionValue<number>; debut: number; fin: number }) {
  const opacite = useTransform(progression, [debut, fin], [0.18, 1]);
  return <motion.span style={{ opacity: opacite }} className="inline">{children} </motion.span>;
}
