import type { ReactNode } from "react";

/** Section ciblée par le sommaire « Sur cette page » : ancre, marge sous la barre haute et focus sans contour. */
export function Section({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 outline-none ${className}`.trim()}>
      {children}
    </section>
  );
}
