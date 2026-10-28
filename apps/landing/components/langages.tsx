"use client";

import { useInView } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Logo d'une techno : fichier SVG dans /public/techs, ou pastille de lettres quand il n'y en a pas. */
export function LogoTechno({ logo, lettres, nom, taille = "h-6 w-6" }: { logo?: string | undefined; lettres?: string | undefined; nom: string; taille?: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/techs/${logo}.svg`} alt="" aria-hidden="true" className={`${taille} shrink-0`} />;
  }
  return (
    <span aria-hidden="true" className={`flex ${taille} shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-600`} title={nom}>
      {lettres}
    </span>
  );
}

interface Langage {
  id: string;
  nom: string;
  logo: string;
  fichier: string;
  commentaire: "//" | "#";
  code: string;
}

export const LANGAGES: readonly Langage[] = [
  {
    id: "ts", nom: "TypeScript", logo: "typescript", fichier: "paiement.ts", commentaire: "//",
    code: `const res = await fetch(\`\${process.env.PONT_URL}/v1/payments\`, {
  method: "POST",
  headers: { authorization: \`Bearer \${process.env.PONT_API_KEY}\` },
  body: JSON.stringify({
    amount: 5000,
    currency: "XOF",
    country: "BJ",
    customer: { phone: "+2290100000001" },
    reference: "commande-42",
  }),
});
const paiement = await res.json();`,
  },
  {
    id: "next", nom: "Next.js", logo: "nextdotjs", fichier: "app/api/payer/route.ts", commentaire: "//",
    code: `import { pont } from "@/lib/pont";

export async function POST() {
  const paiement = await pont.createPayment(
    {
      amount: 5000,
      currency: "XOF",
      country: "BJ",
      customer: { phone: "+2290100000001" },
      reference: "commande-42",
    },
    "commande-42",
  );
  return Response.json(paiement);
}`,
  },
  {
    id: "py", nom: "Python", logo: "python", fichier: "paiement.py", commentaire: "#",
    code: `import os, requests

r = requests.post(
    f"{os.environ['PONT_URL']}/v1/payments",
    headers={"authorization": f"Bearer {os.environ['PONT_API_KEY']}"},
    json={
        "amount": 5000,
        "currency": "XOF",
        "country": "BJ",
        "customer": {"phone": "+2290100000001"},
        "reference": "commande-42",
    },
)
paiement = r.json()`,
  },
  {
    id: "php", nom: "PHP", logo: "php", fichier: "paiement.php", commentaire: "//",
    code: `$ch = curl_init(getenv("PONT_URL") . "/v1/payments");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["authorization: Bearer " . getenv("PONT_API_KEY")],
    CURLOPT_POSTFIELDS => json_encode([
        "amount" => 5000,
        "currency" => "XOF",
        "country" => "BJ",
        "customer" => ["phone" => "+2290100000001"],
        "reference" => "commande-42",
    ]),
]);
$paiement = json_decode(curl_exec($ch), true);`,
  },
  {
    id: "go", nom: "Go", logo: "go", fichier: "paiement.go", commentaire: "//",
    code: `body := strings.NewReader(\`{"amount":5000,"currency":"XOF","country":"BJ",
  "customer":{"phone":"+2290100000001"},"reference":"commande-42"}\`)

req, _ := http.NewRequest("POST", os.Getenv("PONT_URL")+"/v1/payments", body)
req.Header.Set("authorization", "Bearer "+os.Getenv("PONT_API_KEY"))

res, err := http.DefaultClient.Do(req)`,
  },
  {
    id: "rb", nom: "Ruby", logo: "ruby", fichier: "paiement.rb", commentaire: "#",
    code: `require "net/http"
require "json"

uri = URI("#{ENV['PONT_URL']}/v1/payments")
req = Net::HTTP::Post.new(uri, "authorization" => "Bearer #{ENV['PONT_API_KEY']}")
req.body = { amount: 5000, currency: "XOF", country: "BJ",
             customer: { phone: "+2290100000001" },
             reference: "commande-42" }.to_json

res = Net::HTTP.start(uri.hostname, uri.port) { |h| h.request(req) }`,
  },
  {
    id: "java", nom: "Java", logo: "openjdk", fichier: "Paiement.java", commentaire: "//",
    code: `var corps = """
  {"amount":5000,"currency":"XOF","country":"BJ",
   "customer":{"phone":"+2290100000001"},"reference":"commande-42"}""";

var requete = HttpRequest.newBuilder(URI.create(System.getenv("PONT_URL") + "/v1/payments"))
    .header("authorization", "Bearer " + System.getenv("PONT_API_KEY"))
    .POST(HttpRequest.BodyPublishers.ofString(corps))
    .build();

var reponse = HttpClient.newHttpClient().send(requete, HttpResponse.BodyHandlers.ofString());`,
  },
  {
    id: "curl", nom: "cURL", logo: "gnubash", fichier: "terminal", commentaire: "#",
    code: `curl -X POST $PONT_URL/v1/payments \\
  -H "authorization: Bearer $PONT_API_KEY" \\
  -d '{"amount":5000,"currency":"XOF","country":"BJ",
       "customer":{"phone":"+2290100000001"},
       "reference":"commande-42"}'`,
  },
];

// Coloration légère, sans dépendance : commentaires, chaînes, nombres, mots-clés, appels de fonction.
const MOTS_CLES = new Set(["const", "let", "var", "await", "async", "function", "return", "import", "from", "export", "new", "true", "false", "null", "nil", "def", "end", "require", "if", "else", "do", "func"]);
const COULEURS = { commentaire: "#71717A", chaine: "#86EFAC", nombre: "#FCA5A5", motCle: "#C4B5FD", fonction: "#7DD3FC", texte: "#E4E4E7" } as const;

interface Jeton { texte: string; couleur: string }

function colorier(code: string, commentaire: "//" | "#"): Jeton[] {
  const debutComm = commentaire === "//" ? "\\/\\/[^\\n]*" : "#[^\\n]*";
  const re = new RegExp(`(${debutComm})|("""[\\s\\S]*?"""|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`[^\`]*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)(\\s*\\()?`, "g");
  const jetons: Jeton[] = [];
  let dernier = 0;
  for (const m of code.matchAll(re)) {
    const debut = m.index ?? 0;
    if (debut > dernier) jetons.push({ texte: code.slice(dernier, debut), couleur: COULEURS.texte });
    const [tout, comm, chaine, nombre, mot, parenthese] = m;
    if (comm) jetons.push({ texte: tout, couleur: COULEURS.commentaire });
    else if (chaine) jetons.push({ texte: tout, couleur: COULEURS.chaine });
    else if (nombre) jetons.push({ texte: tout, couleur: COULEURS.nombre });
    else if (mot && MOTS_CLES.has(mot)) jetons.push({ texte: tout, couleur: COULEURS.motCle });
    else if (mot && parenthese) jetons.push({ texte: tout, couleur: COULEURS.fonction });
    else jetons.push({ texte: tout, couleur: COULEURS.texte });
    dernier = debut + tout.length;
  }
  if (dernier < code.length) jetons.push({ texte: code.slice(dernier), couleur: COULEURS.texte });
  return jetons;
}

const VITESSE = 3; // caractères par tick (22 ms)
const PAUSE_FIN = 3200; // ms de lecture une fois le code écrit
const REPRISE_AUTO = 14000; // ms avant de relancer la rotation après un clic

export function CodeLangages() {
  const conteneur = useRef<HTMLDivElement>(null);
  const visible = useInView(conteneur, { once: true, margin: "-15% 0px" });
  const [indice, setIndice] = useState(0);
  const [ecrits, setEcrits] = useState(0);
  const [auto, setAuto] = useState(true);
  const [survol, setSurvol] = useState(false);
  const [reduit, setReduit] = useState(false);
  const attente = useRef<ReturnType<typeof setTimeout> | null>(null);

  const langage = LANGAGES[indice] ?? LANGAGES[0]!;
  const jetons = useMemo(() => colorier(langage.code, langage.commentaire), [langage]);
  const total = langage.code.length;

  useEffect(() => {
    setReduit(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Frappe progressive.
  useEffect(() => {
    if (!visible || reduit) return;
    setEcrits(0);
    const timer = setInterval(() => {
      setEcrits((n) => {
        if (n >= total) {
          clearInterval(timer);
          return total;
        }
        return Math.min(total, n + VITESSE);
      });
    }, 22);
    return () => clearInterval(timer);
  }, [indice, total, visible, reduit]);

  // Rotation automatique : passe au langage suivant une fois le code lu.
  useEffect(() => {
    if (!visible || reduit || !auto || survol || ecrits < total) return;
    const t = setTimeout(() => setIndice((i) => (i + 1) % LANGAGES.length), PAUSE_FIN);
    return () => clearTimeout(t);
  }, [visible, reduit, auto, survol, ecrits, total]);

  const choisir = useCallback((i: number) => {
    setIndice(i);
    setAuto(false);
    if (attente.current) clearTimeout(attente.current);
    attente.current = setTimeout(() => setAuto(true), REPRISE_AUTO);
  }, []);
  useEffect(() => () => { if (attente.current) clearTimeout(attente.current); }, []);

  const affiche = reduit || !visible ? total : ecrits;
  const enCours = affiche < total;
  let restant = affiche;

  return (
    <div ref={conteneur} onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}>
      <div role="tablist" aria-label="Langage d'intégration" className="flex gap-1 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {LANGAGES.map((l, i) => {
          const actif = i === indice;
          return (
            <button
              key={l.id}
              role="tab"
              aria-selected={actif}
              onClick={() => choisir(i)}
              className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${actif ? "bg-encre text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/techs/${l.logo}.svg`} alt="" aria-hidden="true" className={`h-4 w-4 ${actif && l.logo === "nextdotjs" ? "invert" : ""}`} />
              {l.nom}
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-2xl bg-encre shadow-[0_30px_80px_-40px_rgba(79,70,229,0.55)]">
        <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-3" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="ml-3 text-xs text-zinc-500">{langage.fichier}</span>
        </div>
        <pre className="min-h-[340px] overflow-x-auto p-5 font-mono text-[13px] leading-6 sm:p-6" aria-hidden="true">
          <code>
            {jetons.map((j, i) => {
              if (restant <= 0) return null;
              const part = j.texte.slice(0, restant);
              restant -= part.length;
              return <span key={i} style={{ color: j.couleur }}>{part}</span>;
            })}
            {enCours && <span className="ml-px inline-block h-[1.1em] w-[7px] translate-y-[3px] animate-pulse bg-indigo-300" />}
          </code>
        </pre>
        <span className="sr-only">{langage.code}</span>
        <div className="h-0.5 bg-zinc-800" aria-hidden="true">
          {auto && !survol && !enCours && !reduit && <div key={indice} className="h-full origin-left animate-[remplir_3200ms_linear_forwards] bg-indigo" />}
        </div>
      </div>
    </div>
  );
}
