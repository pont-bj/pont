"use client";

import Image from "next/image";
import { useState } from "react";

const DOCS = "https://docs.pont.aboudouzinsou.com";

const ONGLETS = [
  { id: "modules", titre: "Modules", texte: "Des paquets npm à la carte" },
  { id: "dashboard", titre: "Tableau de bord", texte: "Paiements, soldes, équipe" },
  { id: "test", titre: "Mode test", texte: "8 scénarios sans compte" },
  { id: "cli", titre: "Ligne de commande", texte: "Brancher en une commande" },
  { id: "agents", titre: "Agents IA", texte: "Serveur MCP et llms.txt" },
] as const;

type Id = (typeof ONGLETS)[number]["id"];

const MODULES_CODE = `import { createPontFromEnv } from "@pont-bj/node";

const pont = createPontFromEnv();
const paiement = await pont.createPayment({
  amount: 5000, currency: "XOF", country: "BJ",
  customer: { phone: "+2290100000001" },
  reference: "commande-42",
}, "commande-42-essai-1");`;

const LEDGER_CODE = `import { Ledger, MemoryLedgerStore, Wallets } from "@pont-bj/ledger";

const wallets = new Wallets(new Ledger(new MemoryLedgerStore()));
await wallets.transfer({ from: "awa", to: "koffi",
  currency: "XOF", amount: 2500, transferId: "t1" });`;

const SCENARIOS: [string, string][] = [
  ["+229010 0000001", "succès"],
  ["+229010 0000002", "solde insuffisant"],
  ["+229010 0000003", "jamais confirmé"],
  ["+229010 0000004", "succès, webhook en double"],
  ["+229010 0000005", "succès, webhook tardif"],
  ["+229010 0000006", "agrégateur en panne"],
  ["+229010 0000007", "délai ambigu"],
  ["+229010 0000008", "refusé par le client"],
];

function Code({ titre, code }: { titre: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-[#111]">
      <p className="px-4 pt-3 text-[11px] font-medium text-zinc-500">{titre}</p>
      <pre className="overflow-x-auto px-4 pb-4 pt-2 text-[12px] leading-[19px] text-zinc-200"><code>{code}</code></pre>
    </div>
  );
}

function Capture({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-bordure bg-white shadow-sm">
      <Image src={src} alt={alt} width={1440} height={900} sizes="(min-width: 1024px) 640px, 100vw" className="h-auto w-full" />
    </div>
  );
}

function Panneau({ id }: { id: Id }) {
  if (id === "modules")
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4"><Code titre="paiement.ts" code={MODULES_CODE} /><Code titre="portefeuille.ts" code={LEDGER_CODE} /></div>
        <Capture src="/apercu/paiements.webp" alt="Page Paiements du tableau de bord Pont" />
      </div>
    );
  if (id === "dashboard") return <Capture src="/apercu/apercu.webp" alt="Vue d'ensemble du tableau de bord Pont : volume, paiements récents et état des agrégateurs" />;
  if (id === "test")
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-start [&>*]:min-w-0">
        <div className="rounded-xl border border-bordure bg-white p-5">
          <p className="text-sm font-semibold">Le numéro choisit le scénario</p>
          <ul className="mt-3 divide-y divide-bordure text-[13px]">
            {SCENARIOS.map(([n, s]) => (
              <li key={n} className="flex justify-between gap-4 py-2"><span className="font-mono text-zinc-800">{n}</span><span className="text-zinc-500">{s}</span></li>
            ))}
          </ul>
        </div>
        <Capture src="/apercu/webhooks.webp" alt="Journal des webhooks du tableau de bord Pont" />
      </div>
    );
  if (id === "cli")
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-start [&>*]:min-w-0">
        <Code titre="terminal" code={`$ npx @pont-bj/cli init --dry-run\n$ npx @pont-bj/cli doctor\n$ npx @pont-bj/cli recipes "portefeuille mobile"\n$ npx @pont-bj/cli trigger success`} />
        <Capture src="/apercu/agregateurs.webp" alt="Page Agrégateurs du tableau de bord Pont" />
      </div>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-start [&>*]:min-w-0">
      <Code titre="Claude Code" code={`claude mcp add pont -- npx -y @pont-bj/mcp`} />
      <div className="rounded-xl border border-bordure bg-white p-5 text-[14px] leading-6 text-zinc-600">
        <p className="font-semibold text-encre">Votre assistant lit la doc de Pont.</p>
        <p className="mt-2">Le serveur MCP donne à Claude Code ou Cursor la documentation, les codes d&apos;erreur et la couverture des agrégateurs. La doc publie aussi un <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.9em]">llms.txt</code>.</p>
        <a href={`${DOCS}/agents-ia`} className="mt-4 inline-block font-medium text-indigo hover:underline">Travailler avec un agent IA →</a>
      </div>
    </div>
  );
}

export function ProduitOnglets() {
  const [actif, setActif] = useState<Id>("modules");
  return (
    <div className="mt-14 w-full text-left">
      <div role="tablist" aria-label="Aperçu du produit" className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-5">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            role="tab"
            id={`onglet-${o.id}`}
            aria-selected={actif === o.id}
            aria-controls={`panneau-${o.id}`}
            onClick={() => setActif(o.id)}
            className={`border-t-2 pb-4 pt-4 text-left transition ${actif === o.id ? "border-encre" : "border-bordure hover:border-zinc-400"}`}
          >
            <span className={`block text-[15px] font-semibold ${actif === o.id ? "text-encre" : "text-zinc-500"}`}>{o.titre}</span>
            <span className="mt-1 block text-[13px] leading-5 text-zinc-500">{o.texte}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panneau-${actif}`} aria-labelledby={`onglet-${actif}`} className="mt-6 rounded-3xl bg-zinc-100 p-4 sm:p-8">
        <Panneau id={actif} />
      </div>
    </div>
  );
}
