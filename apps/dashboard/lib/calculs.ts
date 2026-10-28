/** Calculs purs du dashboard (testés) : tout vient des paiements et retraits réellement enregistrés. */

export interface Ligne {
  status: string;
  amount: number;
  createdAt: number;
  updatedAt: number;
  needsReconciliation: boolean;
  provider: string;
}

const JOUR = 86_400_000;
const debutDeJour = (ms: number) => {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Volume encaissé (paiements réussis) par jour sur les `jours` derniers jours, le dernier étant aujourd'hui. */
export function volumeParJour(paiements: Ligne[], maintenant: number, jours = 7): { debut: number; volume: number }[] {
  const aujourdhui = debutDeJour(maintenant);
  const barres = Array.from({ length: jours }, (_, index) => ({ debut: aujourdhui - (jours - 1 - index) * JOUR, volume: 0 }));
  for (const paiement of paiements) {
    if (paiement.status !== "succeeded") continue;
    const index = barres.findIndex((barre) => paiement.createdAt >= barre.debut && paiement.createdAt < barre.debut + JOUR);
    if (index >= 0) barres[index]!.volume += paiement.amount;
  }
  return barres;
}

export const FILTRES_STATUT = ["tous", "reussis", "attente", "echoues", "reconcilier"] as const;
export type FiltreStatut = (typeof FILTRES_STATUT)[number];

export const estFiltre = (valeur: string | undefined): valeur is FiltreStatut => FILTRES_STATUT.includes(valeur as FiltreStatut);

export function correspond(paiement: Pick<Ligne, "status" | "needsReconciliation">, filtre: FiltreStatut): boolean {
  switch (filtre) {
    case "tous":
      return true;
    case "reussis":
      return paiement.status === "succeeded";
    case "attente":
      return ["created", "pending", "processing"].includes(paiement.status) && !paiement.needsReconciliation;
    case "echoues":
      return ["failed", "expired", "cancelled"].includes(paiement.status);
    case "reconcilier":
      return paiement.needsReconciliation && paiement.status !== "succeeded";
  }
}

export function compter<T extends Pick<Ligne, "status" | "needsReconciliation">>(paiements: T[]): Record<FiltreStatut, number> {
  return Object.fromEntries(FILTRES_STATUT.map((filtre) => [filtre, paiements.filter((paiement) => correspond(paiement, filtre)).length])) as Record<FiltreStatut, number>;
}

/** Date courte façon maquette : « Auj., 14:32 », « Hier, 18:22 », sinon « 27 oct., 09:10 ». */
export function dateCourte(ms: number, maintenant: number): string {
  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(ms);
  const ecart = debutDeJour(maintenant) - debutDeJour(ms);
  if (ecart === 0) return `Auj., ${heure}`;
  if (ecart === JOUR) return `Hier, ${heure}`;
  return `${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(ms)}, ${heure}`;
}

export function ilYA(ms: number, maintenant: number): string {
  const secondes = Math.max(0, Math.round((maintenant - ms) / 1000));
  if (secondes < 60) return "à l'instant";
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

export const nombre = (valeur: number) => new Intl.NumberFormat("fr-FR").format(valeur);
export const montant = (valeur: number, devise: string) => `${nombre(valeur)} ${devise}`;

const PAYS: Record<string, string> = { BJ: "Bénin", TG: "Togo", CI: "Côte d'Ivoire", SN: "Sénégal", BF: "Burkina Faso", ML: "Mali", NE: "Niger", GN: "Guinée", CM: "Cameroun", CG: "Congo", CD: "RD Congo", GA: "Gabon" };
const OPERATEURS: Record<string, string> = { mtn: "MTN", moov: "Moov", celtiis: "Celtiis", tmoney: "T-Money", orange: "Orange", wave: "Wave", free: "Free", expresso: "Expresso", wizall: "Wizall", airtel: "Airtel" };
const AGREGATEURS: Record<string, string> = { fedapay: "FedaPay", pawapay: "PawaPay", paydunya: "PayDunya", kkiapay: "Kkiapay", cinetpay: "CinetPay", sandbox: "Sandbox Pont" };

export const nomPays = (code: string) => PAYS[code] ?? code;
export const nomAgregateur = (id: string) => AGREGATEURS[id] ?? id;

/** `mtn_bj` → « MTN Bénin » ; opérateur inconnu : le pays seul. */
export function nomOperateur(operateur: string | null | undefined, pays: string): string {
  if (!operateur) return nomPays(pays);
  const [marque] = operateur.split("_");
  return `${OPERATEURS[marque ?? ""] ?? marque} ${nomPays(pays)}`;
}

const echapperCsv = (valeur: string | number) => {
  const texte = String(valeur);
  // Neutralise l'injection de formules dans Excel / Sheets.
  const sur = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
  return /[",\n;]/.test(sur) ? `"${sur.replace(/"/g, '""')}"` : sur;
};

export function versCsv(entetes: string[], lignes: (string | number)[][]): string {
  return `﻿${[entetes, ...lignes].map((ligne) => ligne.map(echapperCsv).join(";")).join("\r\n")}\r\n`;
}

export const pagePositive = (valeur: string | undefined) => {
  const page = Number(valeur);
  return Number.isInteger(page) && page > 0 ? page : 1;
};

/** « Dégradé » : moins de 90 % de réussite avec au moins 3 paiements réglés sur la dernière heure. Sans paiement, on ne prétend rien. */
export const estDegrade = (sante: { lastHour: { settled: number; rate: number } | null }) => sante.lastHour !== null && sante.lastHour.settled >= 3 && sante.lastHour.rate < 0.9;
