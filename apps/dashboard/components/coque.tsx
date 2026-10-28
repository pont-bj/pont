import Link from "next/link";
import type { ReactNode } from "react";
import type { RoleSet } from "@pont/auth";
import { seDeconnecter } from "@/app/actions";
import { estDegrade } from "@/lib/calculs";
import { getProvidersHealth } from "@/lib/pont";
import { DEVELOPPEURS, NAV_PRINCIPALE, PARAMETRES, estActif, groupeDe, type LienNav } from "@/lib/navigation";
import { Cadre } from "./cadre";
import { IconeAgregateurs, IconeApercu, IconeChevrons, IconeDeveloppeurs, IconePaiements, IconeParametres, IconePortefeuille, IconeRegistre, IconeRetraits } from "./icones";
import { MenuUtilisateur } from "./menu-utilisateur";
import { Onglets } from "./onglets";

/** Pastille de raccourci (« g puis p ») visible au survol et au focus, discrète au repos. */
function ToucheNav({ touche, decale = false }: { touche: string; decale?: boolean }) {
  return (
    <span aria-hidden className={`absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-[10px] text-zinc-400 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 ${decale ? "mr-3" : ""}`}>
      <kbd className="rounded border border-bordure bg-white px-1 font-sans font-medium">g</kbd>
      <kbd className="rounded border border-bordure bg-white px-1 font-sans font-medium">{touche}</kbd>
    </span>
  );
}

interface Props {
  actif: string;
  email: string;
  name?: string;
  role: string | null | undefined;
  roles: RoleSet;
  /** Sandbox actif (sinon le mode vient de `mode`). */
  sandbox: boolean;
  mode?: "test" | "live";
  /** Portefeuille et registre disponibles (stockage PostgreSQL) : masque leurs liens sinon. */
  wallet?: boolean;
  titre: string;
  texte?: ReactNode;
  action?: ReactNode;
  /** Pas de titre (page de détail avec son propre en-tête). */
  sansEntete?: boolean;
  children: ReactNode;
}

const ICONES: Record<string, (props: { className?: string }) => ReactNode> = {
  "/": IconeApercu,
  "/paiements": IconePaiements,
  "/retraits": IconeRetraits,
  "/portefeuilles": IconePortefeuille,
  "/registre": IconeRegistre,
  "/agregateurs": IconeAgregateurs,
  "/developpeurs": IconeDeveloppeurs,
};

const ligne = (actif: boolean) =>
  `group relative flex h-[35px] items-center gap-3 rounded-lg px-2.5 text-base transition ${actif ? "bg-indigo-50 font-medium text-indigo-texte" : "text-zinc-600 hover:bg-zinc-100"}`;

export async function Coque({ actif, email, name, role, roles, sandbox, mode, wallet = true, titre, texte, action, sansEntete = false, children }: Props) {
  const peut = (lien: LienNav) => (lien.resource === null || roles.can(role, lien.resource, lien.action)) && (wallet || !lien.portefeuille);
  const groupe = groupeDe(actif);
  const liens = NAV_PRINCIPALE.filter(peut);
  const onglets = (groupe === "developpeurs" ? DEVELOPPEURS : groupe === "parametres" ? PARAMETRES : []).filter(peut);
  const parametres = PARAMETRES.filter(peut);
  const parametresActif = groupe === "parametres";
  // Pastille ambre sur « Agrégateurs » quand l'un d'eux est dégradé ; l'indisponibilité de l'API ne casse pas la coque.
  const alerteAgregateurs = liens.some((lien) => lien.href === "/agregateurs") && (await getProvidersHealth().then((sante) => sante.some(estDegrade), () => false));
  const modeAffiche = mode ?? (sandbox ? "test" : "live");

  const sidebar = (
    <div className="flex h-full flex-col gap-7 px-3 pb-4 pt-5">
      <div className="flex h-9 items-center gap-2.5 px-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo text-[14px] font-bold text-white">P</span>
        <span className="flex-1 truncate text-base font-semibold">Pont</span>
        <IconeChevrons className="text-zinc-400" />
      </div>
      <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
        {liens.map((lien) => {
          const Icone = ICONES[lien.href]!;
          const courant = estActif(actif, lien.href, groupe);
          return (
            <Link key={lien.href} href={lien.href} aria-current={courant ? "page" : undefined} className={ligne(courant)}>
              <Icone className={courant ? "text-[#4338ca]" : "text-zinc-500"} />
              <span className="whitespace-nowrap">{lien.label}</span>
              {lien.touche && <ToucheNav touche={lien.touche} decale={lien.href === "/agregateurs" && alerteAgregateurs} />}
              {lien.href === "/agregateurs" && alerteAgregateurs && <span aria-label="À surveiller" className="absolute right-[10px] top-[14.5px] h-1.5 w-1.5 rounded-full bg-[#d97706]" />}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      {parametres.length > 0 && (
        <Link href={parametres[0]!.href} aria-current={parametresActif ? "page" : undefined} className={ligne(parametresActif)}>
          <IconeParametres className={parametresActif ? "text-[#4338ca]" : "text-zinc-500"} style={{ ["--icone-fond" as string]: parametresActif ? "#eef2ff" : "#fafafa" }} />
          Paramètres
          <ToucheNav touche="s" />
        </Link>
      )}
      <MenuUtilisateur nom={name || email.split("@")[0]!} email={email} role={role ?? "—"} deconnexion={seDeconnecter} />
    </div>
  );

  const commandes = [
    ...liens.map((lien) => ({ label: lien.label, href: lien.href, groupe: "Navigation" })),
    ...DEVELOPPEURS.filter(peut).map((onglet) => ({ label: `Développeurs · ${onglet.label}`, href: onglet.href, groupe: "Développeurs" })),
    ...parametres.map((onglet) => ({ label: `Paramètres · ${onglet.label}`, href: onglet.href, groupe: "Paramètres" })),
  ].filter((commande, index, toutes) => toutes.findIndex((autre) => autre.href === commande.href) === index);

  // Cibles des séquences « g puis … » : pages principales, onglets et Paramètres, filtrés par vos permissions.
  const navigation = [
    ...liens.map((lien) => ({ touche: lien.touche, label: lien.label, href: lien.href })),
    ...DEVELOPPEURS.filter(peut).map((onglet) => ({ touche: onglet.touche, label: `Développeurs · ${onglet.label}`, href: onglet.href })),
    ...(parametres[0] ? [{ touche: "s", label: "Paramètres", href: parametres[0].href }] : []),
    ...parametres.map((onglet) => ({ touche: onglet.touche, label: `Paramètres · ${onglet.label}`, href: onglet.href })),
  ]
    .filter((cible, index, toutes) => toutes.findIndex((autre) => autre.href === cible.href) === index)
    .filter((cible): cible is { touche: string; label: string; href: string } => Boolean(cible.touche));

  return (
    <Cadre sidebar={sidebar} commandes={commandes} navigation={navigation} mode={modeAffiche} placeholder="Rechercher un paiement…">
      {!sansEntete && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{titre}</h1>
            {texte && <p className="mt-1 text-sm text-zinc-500">{texte}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {onglets.length > 1 && <Onglets onglets={onglets} actif={actif} />}
      {children}
    </Cadre>
  );
}
