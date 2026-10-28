import Image from "next/image";
import { api } from "@/convex/_generated/api";
import { Formulaire } from "@/components/formulaire";
import { Logotype, Symbole } from "@/components/logo";
import { Compte, Mouvement, MotsReveles, Revele } from "@/components/anim";
import { DashboardVivant } from "@/components/dashboard-vivant";
import { Defilement, Etapes, Logos, PontRecit, TerminalAnime } from "@/components/recit";
import { Icone } from "@/components/icones";
import { CodeLangages, LogoTechno } from "@/components/langages";
import { convexServeur } from "@/lib/convex";

export const revalidate = 60;

async function nombreInscrits(): Promise<number | null> {
  try {
    return await convexServeur().query(api.liste.compteur, {});
  } catch {
    return null;
  }
}

const AGREGATEURS = [
  { nom: "FedaPay", src: "/agregateurs/fedapay.svg", l: 110 },
  { nom: "PawaPay", src: "/agregateurs/pawapay.svg", l: 106 },
  { nom: "PayDunya", src: "/agregateurs/paydunya.png", l: 96 },
  { nom: "Kkiapay", src: "/agregateurs/kkiapay.svg", l: 120 },
];

// Bandes verticales (v) ou horizontales (h) : drapeaux simplifiés, étoiles omises sous 16 px.
const PAYS: { nom: string; drapeau: React.ReactNode }[] = [
  { nom: "Bénin", drapeau: <><rect width="24" height="8" fill="#FCD116" /><rect y="8" width="24" height="8" fill="#E8112D" /><rect width="9.6" height="16" fill="#008751" /></> },
  { nom: "Côte d'Ivoire", drapeau: <><rect width="8" height="16" fill="#F77F00" /><rect x="8" width="8" height="16" fill="#fff" /><rect x="16" width="8" height="16" fill="#009E60" /></> },
  { nom: "Sénégal", drapeau: <><rect width="8" height="16" fill="#00853F" /><rect x="8" width="8" height="16" fill="#FDEF42" /><rect x="16" width="8" height="16" fill="#E31B23" /><polygon points="12,5.5 12.9,8.2 15.6,8.2 13.4,9.8 14.2,12.4 12,10.8 9.8,12.4 10.6,9.8 8.4,8.2 11.1,8.2" fill="#00853F" /></> },
  { nom: "Togo", drapeau: <><rect width="24" height="16" fill="#006A4E" /><rect y="3.2" width="24" height="3.2" fill="#FFCE00" /><rect y="9.6" width="24" height="3.2" fill="#FFCE00" /><rect width="9.6" height="9.6" fill="#D21034" /><polygon points="4.8,2.4 5.5,4.3 7.4,4.3 5.9,5.5 6.4,7.4 4.8,6.2 3.2,7.4 3.7,5.5 2.2,4.3 4.1,4.3" fill="#fff" /></> },
  { nom: "Burkina Faso", drapeau: <><rect width="24" height="8" fill="#EF2B2D" /><rect y="8" width="24" height="8" fill="#009E49" /><polygon points="12,5.5 12.9,8.2 15.6,8.2 13.4,9.8 14.2,12.4 12,10.8 9.8,12.4 10.6,9.8 8.4,8.2 11.1,8.2" fill="#FCD116" /></> },
  { nom: "Cameroun", drapeau: <><rect width="8" height="16" fill="#007A5E" /><rect x="8" width="8" height="16" fill="#CE1126" /><rect x="16" width="8" height="16" fill="#FCD116" /><polygon points="12,5.5 12.9,8.2 15.6,8.2 13.4,9.8 14.2,12.4 12,10.8 9.8,12.4 10.6,9.8 8.4,8.2 11.1,8.2" fill="#FCD116" /></> },
  { nom: "Congo", drapeau: <><rect width="24" height="16" fill="#FBDE4A" /><polygon points="0,0 16,0 0,16" fill="#009543" /><polygon points="24,0 24,16 8,16" fill="#DC241F" /></> },
  { nom: "Gabon", drapeau: <><rect width="24" height="5.34" fill="#009E60" /><rect y="5.33" width="24" height="5.34" fill="#FCD116" /><rect y="10.66" width="24" height="5.34" fill="#3A75C4" /></> },
];


const ETAPES = [
  ["01", "Installez", "Une commande lance Pont, sa base de données et le tableau de bord sur votre serveur.", "serveur"],
  ["02", "Ajoutez vos clés", "Collez les clés de FedaPay, PawaPay, PayDunya ou Kkiapay dans le tableau de bord. Pont les teste avant de les garder.", "cle"],
  ["03", "Branchez votre appli", "Une commande écrit le code pour vous. Ou demandez-le à votre assistant IA : Pont sait lui parler.", "terminal"],
  ["04", "Testez sans risque", "Le mode test simule un succès, un refus ou un paiement jamais confirmé. Aucun vrai argent ne bouge.", "fiole"],
] as const;

const APERCUS = [
  {
    id: "paiements", etiquette: "Paiements", fond: "bg-indigo-50/70", image: "/apercu/paiements.webp",
    titre: "Tous vos paiements sur un seul écran.",
    texte: "Voyez chaque paiement et chaque retrait, rembourser en un clic, télécharger la liste en CSV. Les statuts sont les mêmes quel que soit l'agrégateur.",
    points: ["Filtres, pages et export CSV", "Le détail de chaque paiement, étape par étape", "Remboursement total ou partiel"],
  },
  {
    id: "agregateurs", etiquette: "Agrégateurs", fond: "bg-emerald-50/60", image: "/apercu/agregateurs.webp",
    titre: "Branchez vos agrégateurs sans toucher au code.",
    texte: "Collez vos clés dans le tableau de bord. Pont vérifie qu'elles marchent, les chiffre, puis s'en sert tout de suite. Il manque un agrégateur ? Une commande génère son adaptateur.",
    points: ["FedaPay, PawaPay, PayDunya, Kkiapay", "Clés chiffrées sur votre serveur", "Vos propres agrégateurs, ajoutés par la CLI"],
  },
  {
    id: "webhooks", etiquette: "Webhooks", fond: "bg-amber-50/70", image: "/apercu/webhooks.webp",
    titre: "Des notifications qui arrivent, même si votre serveur dort.",
    texte: "Quand un paiement change d'état, Pont prévient votre application. Si elle ne répond pas, il réessaie pendant 3 jours et garde l'historique.",
    points: ["Signature pour vérifier l'expéditeur", "Nouvel essai automatique, renvoi en un clic", "Le journal de chaque livraison"],
  },
] as const;

const INCLUS = [
  ["echange", "Une seule API", "Même format et mêmes statuts pour FedaPay, PawaPay, PayDunya et Kkiapay."],
  ["portefeuille", "Portefeuilles", "Comptes clients, dépôts, retraits, transferts et plafonds selon le niveau de vérification."],
  ["liste", "Registre comptable", "Chaque mouvement est écrit deux fois (débit et crédit). Les soldes sont toujours justes."],
  ["equipe", "Équipe et rôles", "Créez vos rôles (caissier, comptable, admin…) et choisissez ce que chacun peut faire."],
  ["cloche", "Alertes par e-mail", "Soyez prévenu d'un agrégateur en panne, d'un solde bas ou d'un webhook en échec."],
  ["courrier", "Votre propre SMTP", "Mot de passe oublié et alertes partent depuis votre adresse e-mail."],
  ["fiole", "Mode test", "Simulez succès, refus et paiement jamais confirmé avec des numéros de test."],
  ["commande", "Recherche et raccourcis", "⌘K pour aller partout, une lettre par page. Le tableau de bord se pilote au clavier."],
  ["etincelles", "Pour les assistants IA", "Claude Code ou Cursor lisent la doc de Pont et branchent le paiement à votre place."],
  ["cadenas", "HTTPS en production", "Un profil prêt à l'emploi avec certificat automatique, sans ouvrir de port inutile."],
  ["base", "PostgreSQL par défaut", "Vos données dans une base standard. Convex reste disponible en option."],
  ["livre", "Documentation complète", "Guides pas à pas, référence de l'API, schémas et visite du tableau de bord."],
] as const;

const CAS = [
  ["portefeuille", "Portefeuille mobile", "Dépôts, retraits, transferts, frais et plafonds par niveau de vérification.", "Disponible"],
  ["liste", "Paiement de factures", "Encaissez et remboursez des paiements simples.", "Disponible"],
  ["equipe", "Tontine", "Cotisations régulières et tours de versement.", "Bientôt"],
  ["bouclier", "Marketplace avec séquestre", "L'argent attend la livraison avant d'être versé au vendeur.", "Bientôt"],
] as const;

const GARANTIES = [
  ["wallet", "Pont ne garde jamais votre argent", "L'argent va de vos clients à votre compte chez l'agrégateur. Pont orchestre, il ne détient rien."],
  ["coche", "Chaque paiement est revérifié", "Avant d'écrire « payé », Pont redemande à l'agrégateur. Jamais sur la seule foi d'un message reçu."],
  ["cle", "Vos clés sont chiffrées", "En self-host, elles restent sur votre serveur, chiffrées en AES-256. Elles ne s'affichent plus en entier."],
  ["relance", "Pas de double paiement", "Envoyer deux fois la même commande donne le même paiement. Un réessai ne débite jamais deux fois."],
] as const;

const TECHNOS = {
  officiel: [
    ["TypeScript et Node.js", "SDK `@pont/node`", true, "typescript", ""],
    ["Next.js", "Routes et webhooks générés par `pont init`", true, "nextdotjs", ""],
    ["Convex", "Modèle d'intégration prêt à l'emploi", true, "", "Cx"],
    ["React", "Composants de paiement", false, "react", ""],
    ["PHP et Laravel", "SDK et package dédiés", false, "laravel", ""],
    ["WordPress et WooCommerce", "Passerelle de paiement", false, "woocommerce", ""],
  ],
  autres: [
    ["Python", "python", ""], ["Go", "go", ""], ["Ruby", "ruby", ""], ["Java", "openjdk", ""],
    ["C#", "", "C#"], ["Dart et Flutter", "flutter", ""], ["Swift", "swift", ""], ["Kotlin", "kotlin", ""],
  ],
} as const;

const OFFRES = {
  selfhost: ["Paiements, portefeuilles et registre", "Tableau de bord, rôles, e-mail et alertes", "Webhooks fiables et mode test", "Assistant IA (MCP) et CLI", "Vos clés et vos données chez vous", "Open source"],
  cloud: ["Rien à installer ni à maintenir", "Sauvegardes et surveillance", "Clés chiffrées, une clé par client", "Mises à jour automatiques", "Support"],
};

const FAQ = [
  ["Pont garde-t-il mon argent ?", "Non. L'argent va de vos clients à votre compte chez l'agrégateur. Pont envoie les ordres, vérifie les résultats et tient les comptes, mais il ne détient jamais les fonds."],
  ["Le self-host est-il vraiment gratuit ?", "Oui, à vie. C'est le même logiciel que la version hébergée : vous l'installez sur votre serveur, sans limite ni carte bancaire."],
  ["Quelle différence avec Pont Cloud ?", "Avec Pont Cloud, nous hébergeons et maintenons Pont pour vous. Les tarifs seront annoncés au lancement. Inscrivez-vous pour être prévenu."],
  ["Faut-il un compte chez un agrégateur ?", "Oui, pour recevoir de vrais paiements : Pont utilise vos propres comptes. Pour essayer, le mode test suffit, sans attendre votre dossier KYC."],
  ["Mon agrégateur n'est pas dans la liste.", "Une commande (`pont provider new`) vous pose quelques questions et génère son adaptateur. Il apparaît ensuite dans le tableau de bord."],
  ["Avec quelles technologies ça marche ?", "Node.js, Next.js et Convex ont un SDK ou un modèle prêt à l'emploi. Tous les autres langages passent par l'API HTTP. PHP, Laravel et WooCommerce arrivent ensuite."],
] as const;

const PIED = [
  ["Produit", [["Aperçu", "#apercu"], ["Ce qui est inclus", "#inclus"], ["Technologies", "#technos"], ["Cas d'usage", "#cas"], ["Self-host et Cloud", "#offres"]]],
  ["Apprendre", [["Documentation", "https://docs.pont.aboudouzinsou.com"], ["Démarrer en 5 minutes", "https://docs.pont.aboudouzinsou.com/guides"], ["Référence de l'API", "https://docs.pont.aboudouzinsou.com/api"], ["Visite du tableau de bord", "https://docs.pont.aboudouzinsou.com/guides/visite-du-dashboard"]]],
  ["Confiance", [["Sécurité", "#securite"], ["Questions fréquentes", "#faq"], ["Mise en production", "https://docs.pont.aboudouzinsou.com/guides/mise-en-production"]]],
] as const;

function Drapeau({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10" aria-hidden="true">
      {children}
    </svg>
  );
}


function Compteur({ n, sombre = false }: { n: number | null; sombre?: boolean }) {
  if (n === null) return <p className={`text-sm ${sombre ? "text-indigo-100" : "text-zinc-500"}`}>Self-host gratuit à vie.</p>;
  return (
    <p className={`text-sm ${sombre ? "text-indigo-100" : "text-zinc-600"}`}>
      <strong className={sombre ? "text-white" : "text-encre"}>{n.toLocaleString("fr-FR")}</strong> développeurs et fintechs déjà inscrits
    </p>
  );
}

function Etiquette({ children, clair = false }: { children: React.ReactNode; clair?: boolean }) {
  return <p className={`text-xs font-semibold uppercase tracking-wider ${clair ? "text-indigo-300" : "text-indigo"}`}>{children}</p>;
}

function Coche({ className = "" }: { className?: string }) {
  return <Icone nom="coche" className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />;
}

export default async function Page() {
  const n = await nombreInscrits();
  return (
    <Mouvement>
      <header className="sticky top-0 z-30 border-b border-transparent bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <nav className="mx-auto flex max-w-[1200px] items-center gap-8 px-4 py-4 sm:px-6" aria-label="Navigation principale">
          <a href="#" aria-label="Pont, accueil"><Logotype taille="text-[26px]" /></a>
          <div className="hidden flex-1 justify-center gap-7 text-sm font-medium text-zinc-600 md:flex">
            <a href="#apercu" className="hover:text-encre">Aperçu</a>
            <a href="#inclus" className="hover:text-encre">Ce qui est inclus</a>
            <a href="#technos" className="hover:text-encre">Technologies</a>
            <a href="#offres" className="hover:text-encre">Self-host et Cloud</a>
            <a href="#faq" className="hover:text-encre">FAQ</a>
            <a href="https://docs.pont.aboudouzinsou.com" className="hover:text-encre">Documentation</a>
          </div>
          <a href="#rejoindre" className="ml-auto rounded-lg bg-encre px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 md:ml-0">Rejoindre la liste</a>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto flex max-w-[1200px] flex-col items-center px-4 pb-12 pt-12 text-center sm:px-6 sm:pt-20">
          <Revele><span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3.5 py-1.5 text-[13px] font-medium text-indigo-fonce">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo" /> Self-host gratuit à vie · Pont Cloud bientôt
          </span></Revele>
          <MotsReveles delai={0.15} texte="Le backend de ta fintech, en un clic." className="mt-6 max-w-[900px] font-titre text-[40px] font-semibold leading-[1.08] tracking-tight sm:text-6xl" />
          <Revele delai={0.7}><p className="mt-6 max-w-[700px] text-base leading-7 text-zinc-600 sm:text-lg">
            Paiements mobile money, portefeuilles, comptabilité, équipe et tableau de bord : tout ce que chaque fintech africaine finit par recoder,
            installé sur votre serveur.
          </p></Revele>
          <Revele delai={0.9} className="relative z-20 mt-8 flex w-full scroll-mt-28 flex-col items-center gap-4"><div id="rejoindre" className="flex w-full flex-col items-center gap-4">
            <Formulaire id="hero" />
            <Compteur n={n} />
          </div></Revele>

          <DashboardVivant />
        </section>

        {/* Compatibilité */}
        <section className="mx-auto flex max-w-[1200px] flex-col items-center gap-5 pb-20 pt-6" aria-label="Compatibilité">
          <p className="text-sm text-zinc-500">Fonctionne avec les agrégateurs que vous utilisez déjà</p>
          <Logos logos={AGREGATEURS} />
          <Defilement duree={40} inverse>
            {PAYS.map((p) => (
              <span key={p.nom} className="flex shrink-0 items-center gap-2 rounded-full border border-bordure bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-600">
                <Drapeau>{p.drapeau}</Drapeau>{p.nom}
              </span>
            ))}
          </Defilement>
          <p className="text-xs text-zinc-400">+ d&apos;autres agrégateurs et pays à venir, ou le vôtre grâce à la CLI</p>
        </section>

        <PontRecit />

        {/* Aperçu : vraies captures du tableau de bord */}
        <section id="apercu" className="scroll-mt-20">
          <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-20 text-center sm:px-6 sm:pt-28">
            <Etiquette>Aperçu</Etiquette>
            <Revele><h2 className="mx-auto mt-2 max-w-[760px] font-titre text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-tight">Un tableau de bord prêt dès l&apos;installation.</h2></Revele>
            <Revele delai={0.1}><p className="mx-auto mt-4 max-w-[620px] text-base leading-7 text-zinc-600">Voici ce que vous voyez après <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[0.9em]">./setup.sh</code>. Ces écrans sont de vraies captures, prises en mode test.</p></Revele>
          </div>
          <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
            <Revele>
              <div className="overflow-hidden rounded-2xl border border-bordure bg-white shadow-[0_40px_90px_-40px_rgba(79,70,229,0.45)]">
                <div className="flex items-center gap-1.5 border-b border-bordure bg-zinc-50 px-4 py-3" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-200" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
                  <span className="ml-3 text-xs text-zinc-400">localhost:3300</span>
                </div>
                <Image src="/apercu/apercu.webp" alt="Vue d'ensemble du tableau de bord Pont : volume, paiements récents et état des agrégateurs" width={1440} height={900} sizes="(min-width: 1100px) 1100px, 100vw" className="h-auto w-full" priority={false} />
              </div>
            </Revele>
          </div>
          {APERCUS.map((a, i) => (
            <div key={a.id} className={`mt-20 ${a.fond} px-4 py-16 sm:px-6 sm:py-24`}>
              <div className={`mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-2 lg:gap-16 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                <Revele>
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo">{a.etiquette}</p>
                  <h3 className="mt-2 font-titre text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">{a.titre}</h3>
                  <p className="mt-4 text-base leading-7 text-zinc-600">{a.texte}</p>
                  <ul className="mt-6 space-y-2.5 text-[15px] text-zinc-700">
                    {a.points.map((p) => <li key={p} className="flex gap-2.5"><Coche className="text-indigo" />{p}</li>)}
                  </ul>
                </Revele>
                <Revele delai={0.1}>
                  <div className="overflow-hidden rounded-2xl border border-bordure bg-white shadow-[0_30px_70px_-35px_rgba(24,24,27,0.35)] transition duration-500 hover:-translate-y-1">
                    <Image src={a.image} alt={`Page ${a.etiquette} du tableau de bord Pont`} width={1440} height={900} sizes="(min-width: 1024px) 560px, 100vw" className="h-auto w-full" />
                  </div>
                </Revele>
              </div>
            </div>
          ))}
        </section>

        {/* Méthode */}
        <section id="methode" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
          <Etiquette>En quatre étapes</Etiquette>
          <Revele><h2 className="mt-2 font-titre text-3xl font-semibold tracking-tight sm:text-[40px]">De zéro au premier paiement en quelques minutes.</h2></Revele>
          <Etapes etapes={ETAPES} />
        </section>

        {/* Tout ce qui est inclus */}
        <section id="inclus" className="scroll-mt-20 border-y border-bordure bg-zinc-50/70 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1200px]">
            <Etiquette>Ce qui est inclus</Etiquette>
            <Revele><h2 className="mt-2 max-w-[760px] font-titre text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-tight">Tout ce qu&apos;il faut pour faire tourner une fintech.</h2></Revele>
            <p className="mt-3 max-w-[640px] text-base leading-7 text-zinc-600">Vous décrivez votre produit. Pont apporte la partie que toutes les équipes finissent par réécrire, et vous gardez la main sur le code, les clés et les données.</p>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INCLUS.map(([, t, d], i) => (
                <Revele as="li" key={t} delai={(i % 3) * 0.08} className="group rounded-2xl border border-bordure bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_-22px_rgba(79,70,229,0.4)]">
                  <h3 className="font-titre text-[17px] font-semibold">{t}</h3>
                  <p className="mt-2 text-sm leading-[22px] text-zinc-500">{d}</p>
                </Revele>
              ))}
            </ul>
            <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1fr_560px]">
              <div>
                <Revele><h3 className="font-titre text-2xl font-semibold tracking-tight">Une commande, et c&apos;est branché.</h3></Revele>
                <p className="mt-3 max-w-[460px] text-[15px] leading-7 text-zinc-600">Pont repère votre projet (Next.js, Node, Laravel…), écrit les routes de paiement et lance un premier paiement de test.</p>
              </div>
              <TerminalAnime />
            </div>
          </div>
        </section>

        {/* Langages et frameworks */}
        <section id="technos" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
          <Etiquette>Langages et frameworks</Etiquette>
          <Revele><h2 className="mt-2 max-w-[760px] font-titre text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-tight">Utilisez Pont avec ce que vous connaissez déjà.</h2></Revele>
          <p className="mt-3 max-w-[640px] text-base leading-7 text-zinc-600">Pont est un serveur avec une API HTTP : tout langage qui envoie une requête peut s&apos;en servir. Pour Node.js, Next.js et Convex, un SDK ou un modèle prêt à l&apos;emploi existe déjà ; PHP, Laravel et WooCommerce arrivent ensuite.</p>
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1fr_600px] lg:gap-14">
            <div>
              <p className="text-sm font-semibold text-zinc-500">SDK et modèles prêts à l&apos;emploi</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {TECHNOS.officiel.map(([nom, detail, dispo, logo, lettres], i) => (
                  <Revele as="li" key={nom} delai={(i % 2) * 0.08} className="rounded-2xl border border-bordure bg-white p-4 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_-22px_rgba(79,70,229,0.4)]">
                    <div className="flex items-center gap-3">
                      <LogoTechno logo={logo || undefined} lettres={lettres} nom={nom} taille="h-8 w-8" />
                      <h3 className="min-w-0 flex-1 font-titre text-[15px] font-semibold leading-tight">{nom}</h3>
                    </div>
                    <p className="mt-3 text-[13px] leading-5 text-zinc-500">{detail}</p>
                    <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${dispo ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{dispo ? "Disponible" : "Bientôt"}</span>
                  </Revele>
                ))}
              </ul>
              <p className="mt-8 text-sm font-semibold text-zinc-500">Avec l&apos;API HTTP, depuis n&apos;importe quel langage</p>
              <ul className="mt-4 flex flex-wrap gap-2.5">
                {TECHNOS.autres.map(([nom, logo, lettres]) => (
                  <li key={nom} className="flex items-center gap-2 rounded-full border border-bordure bg-white py-2 pl-3 pr-4 text-sm font-medium text-zinc-700">
                    <LogoTechno logo={logo || undefined} lettres={lettres} nom={nom} taille="h-4 w-4" />{nom}
                  </li>
                ))}
                <li className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-fonce">et tous les autres</li>
              </ul>
            </div>
            <Revele delai={0.1}><CodeLangages /></Revele>
          </div>
        </section>

        {/* Cas d'usage */}
        <section id="cas" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1200px]">
            <Etiquette>Cas d&apos;usage</Etiquette>
            <Revele><h2 className="mt-2 font-titre text-3xl font-semibold tracking-tight sm:text-[40px]">Décrivez votre fintech. Pont installe le reste.</h2></Revele>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CAS.map(([, t, d, s], i) => (
                <Revele as="li" key={t} delai={i * 0.1} className={`group flex flex-col rounded-2xl border bg-white p-6 ${s === "Disponible" ? "border-indigo-100 ring-1 ring-indigo-100" : "border-bordure"}`}>
                  <h3 className="font-titre text-lg font-semibold">{t}</h3>
                  <p className="mt-2 flex-1 text-sm leading-[21px] text-zinc-500">{d}</p>
                  <p className={`mt-4 inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${s === "Disponible" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{s}</p>
                </Revele>
              ))}
            </ul>
          </div>
        </section>

        {/* Self-host / Cloud */}
        <section id="offres" className="scroll-mt-20 bg-zinc-50/70 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1000px] text-center">
            <Etiquette>Deux façons de l&apos;utiliser</Etiquette>
            <Revele><h2 className="mt-2 font-titre text-3xl font-semibold tracking-tight sm:text-[40px]">Gratuit chez vous. Géré chez nous.</h2></Revele>
            <div className="mt-12 grid gap-5 text-left md:grid-cols-2">
              <Revele className="flex flex-col rounded-2xl border-2 border-indigo bg-white p-8 shadow-[0_30px_70px_-40px_rgba(79,70,229,0.6)]">
                <h3 className="font-titre text-lg font-semibold">Self-host</h3>
                <p className="mt-2 font-titre text-4xl font-semibold text-indigo">Gratuit à vie</p>
                <p className="mt-2 text-sm text-zinc-500">Sur votre serveur, avec votre base de données.</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[15px] text-zinc-700">{OFFRES.selfhost.map((o) => <li key={o} className="flex gap-2.5"><Coche className="text-indigo" />{o}</li>)}</ul>
                <a href="#rejoindre" className="mt-8 rounded-xl bg-indigo px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-indigo-fonce">Être prévenu du lancement</a>
              </Revele>
              <Revele delai={0.1} className="flex flex-col rounded-2xl border border-bordure bg-white p-8">
                <h3 className="font-titre text-lg font-semibold">Pont Cloud</h3>
                <p className="mt-2 font-titre text-4xl font-semibold text-zinc-700">Bientôt</p>
                <p className="mt-2 text-sm text-zinc-500">Hébergé et maintenu par Pont. Tarifs annoncés au lancement.</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[15px] text-zinc-700">{OFFRES.cloud.map((o) => <li key={o} className="flex gap-2.5"><Coche className="text-zinc-400" />{o}</li>)}</ul>
                <a href="#rejoindre" className="mt-8 rounded-xl border border-zinc-300 px-5 py-3 text-center text-sm font-semibold transition hover:bg-zinc-50">Rejoindre la liste d&apos;attente</a>
              </Revele>
            </div>
          </div>
        </section>

        {/* Sécurité */}
        <section id="securite" className="scroll-mt-20 bg-encre px-4 py-20 text-white sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1200px]">
            <Etiquette clair>Sécurité</Etiquette>
            <Revele><h2 className="mt-2 font-titre text-3xl font-semibold tracking-tight sm:text-[40px]">Pont ne détient jamais votre argent.</h2></Revele>
            <p className="mt-3 max-w-[720px] text-base leading-relaxed text-zinc-400">Les fonds circulent entre vos clients, l&apos;agrégateur et vous. Pont envoie les ordres, vérifie les résultats et tient les comptes.</p>
            <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
              {GARANTIES.map(([, t, d], i) => (
                <Revele as="li" key={t} delai={i * 0.1} className="bg-zinc-900 p-7">
                  <h3 className="font-titre text-[17px] font-semibold">{t}</h3>
                  <p className="mt-2 text-sm leading-[21px] text-zinc-400">{d}</p>
                </Revele>
              ))}
            </ul>
            <dl className="mt-12 grid grid-cols-2 gap-8 border-t border-zinc-800 pt-10 lg:grid-cols-4">
              {[["4", "agrégateurs"], ["8", "pays couverts"], ["1", "commande pour installer"], ["0", "franc gardé par Pont"]].map(([v, l]) => (
                <div key={l}><dt className="sr-only">{l}</dt><dd className="font-titre text-4xl font-semibold"><Compte vers={Number(v)} /></dd><dd className="mt-1 text-sm text-zinc-400">{l}</dd></div>
              ))}
            </dl>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto grid max-w-[1200px] scroll-mt-20 gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[340px_1fr] lg:gap-16">
          <div>
            <h2 className="font-titre text-3xl font-semibold tracking-tight">Questions fréquentes</h2>
            <p className="mt-3 text-[15px] text-zinc-500">Une autre question ? Inscrivez-vous, nous répondons à chaque message.</p>
          </div>
          <div>
            {FAQ.map(([q, r]) => (
              <details key={q} className="group border-t border-bordure last:border-b">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium [&::-webkit-details-marker]:hidden">
                  {q}<span className="text-xl text-zinc-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="pb-5 pr-8 text-[15px] leading-relaxed text-zinc-600">{r}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-indigo px-4 py-20 text-center text-white sm:px-6 sm:py-24">
          <div className="mx-auto flex max-w-[800px] flex-col items-center gap-5">
            <Revele><h2 className="font-titre text-3xl font-semibold tracking-tight sm:text-[44px] sm:leading-tight">Construisez votre fintech sur un socle solide.</h2></Revele>
            <p className="text-indigo-100">Self-host gratuit à vie. Les inscrits sont prévenus en premier de l&apos;ouverture de Pont Cloud.</p>
            <Formulaire id="cta" sombre />
            {n !== null && <Compteur n={n} sombre />}
          </div>
        </section>
      </main>

      <footer className="overflow-hidden border-t border-bordure bg-zinc-50/60 px-4 pt-16 sm:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-16">
          <div>
            <Logotype taille="text-[30px]" />
            <p className="mt-4 max-w-[320px] text-[15px] leading-7 text-zinc-600">Le backend de ta fintech, en un clic. Paiements, portefeuilles et comptabilité pour l&apos;Afrique francophone.</p>
            <a href="#rejoindre" className="mt-6 inline-flex rounded-lg bg-encre px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-zinc-800">Rejoindre la liste</a>
          </div>
          {PIED.map(([titre, liens]) => (
            <nav key={titre} aria-label={titre}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{titre}</p>
              <ul className="mt-4 space-y-3 text-[15px]">
                {liens.map(([l, h]) => <li key={l}><a href={h} className="text-zinc-600 transition hover:text-indigo">{l}</a></li>)}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mx-auto mt-14 flex max-w-[1400px] flex-col gap-3 border-t border-bordure pt-6 text-[13px] text-zinc-500 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Pont · Cotonou, Bénin</p>
          <p>Pont n&apos;est affilié à aucun des agrégateurs cités ; les marques appartiennent à leurs titulaires.</p>
        </div>
        <Revele className="mx-auto mt-6 flex max-w-[1400px] select-none items-end justify-center pb-6 sm:pb-10">
          <span className="flex items-end font-titre font-semibold leading-[0.8] tracking-tight text-encre text-[30vw] sm:text-[260px] lg:text-[340px]" aria-hidden="true">
            <Symbole className="h-[0.72em] w-auto" />
            <span className="ml-[0.03em]">ont</span>
          </span>
        </Revele>
      </footer>
    </Mouvement>
  );
}
