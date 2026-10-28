"use client";

import { ReactLenis } from "lenis/react";
import { useEffect, useState } from "react";

/** Défilement amorti (Lenis), désactivé si l'utilisateur réduit les animations. */
export function ScrollDoux({ children }: { children: React.ReactNode }) {
  const [actif, setActif] = useState(false);
  useEffect(() => setActif(!window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  if (!actif) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.09, wheelMultiplier: 1, anchors: { offset: -80 } }}>
      {children}
    </ReactLenis>
  );
}
