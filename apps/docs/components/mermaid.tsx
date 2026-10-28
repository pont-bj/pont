"use client";

import { useEffect, useId, useState } from "react";

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** Diagramme Mermaid rendu côté client, aux couleurs indigo de Pont, clair et sombre. */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(isDark());
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "Inter, system-ui, sans-serif",
        theme: "base",
        themeVariables: dark
          ? { background: "transparent", primaryColor: "#312e81", primaryTextColor: "#e0e7ff", primaryBorderColor: "#818cf8", lineColor: "#a5b4fc", secondaryColor: "#1e1b4b", tertiaryColor: "#0f0d2e", noteBkgColor: "#1e1b4b", noteTextColor: "#e0e7ff", actorBkg: "#312e81", actorBorder: "#818cf8", actorTextColor: "#e0e7ff", signalColor: "#a5b4fc", signalTextColor: "#e0e7ff" }
          : { background: "transparent", primaryColor: "#eef2ff", primaryTextColor: "#1e1b4b", primaryBorderColor: "#4F46E5", lineColor: "#6366f1", secondaryColor: "#e0e7ff", tertiaryColor: "#f5f3ff", noteBkgColor: "#eef2ff", noteTextColor: "#1e1b4b", actorBkg: "#eef2ff", actorBorder: "#4F46E5", actorTextColor: "#1e1b4b", signalColor: "#4338ca", signalTextColor: "#1e1b4b" },
      });
      try {
        const { svg: out } = await mermaid.render(`m${id}${dark ? "d" : "l"}`, chart.trim());
        if (!cancelled) setSvg(out);
      } catch {
        if (!cancelled) setSvg("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, dark, id]);

  return (
    <div
      className="my-6 flex justify-center overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-4 [&_svg]:h-auto [&_svg]:max-w-full"
      role="img"
      aria-label="Diagramme"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
