"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth, hasAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { PontApiError, addEndpoint, refundPayment, emailConfigured, removeEmail, saveAlerts, saveEmail, sendTestAlert, sendTestEmail, createTestPayment, removeEndpoint, removeProvider, resendDelivery, saveProvider, setFrozen } from "@/lib/pont";
import { requirePermission } from "@/lib/session";
import { createUser, deleteRole, saveRole, setUserRole } from "@/lib/roles";
import { RESOURCES, RESOURCE_NAMES } from "@pont/auth";

export interface FormState {
  error?: string;
  /** Confirmation affichée après un enregistrement réussi. */
  message?: string;
  /** Secret de signature d'un nouveau destinataire : montré une seule fois. */
  secret?: string;
}

const fail = (error: unknown): FormState => ({ error: error instanceof PontApiError ? error.message : "Le serveur Pont est injoignable." });

const loginSchema = z.object({ email: z.string().email("Adresse e-mail invalide."), password: z.string().min(1, "Mot de passe requis.") });
const setupSchema = loginSchema.extend({
  name: z.string().min(1, "Nom requis.").max(80),
  password: z.string().min(12, "12 caractères minimum.").max(128),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides.";
}

export async function seConnecter(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { auth } = await getAuth();
  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch {
    return { error: "E-mail ou mot de passe incorrect." };
  }
  redirect("/");
}

export async function creerAdministrateur(_: FormState, form: FormData): Promise<FormState> {
  if (await hasAdmin()) return { error: "Un administrateur existe déjà." };
  const parsed = setupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { auth } = await getAuth();
  try {
    await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch {
    return { error: "Impossible de créer le compte." };
  }
  redirect("/");
}

export async function seDeconnecter(): Promise<void> {
  const { auth } = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function lancerPaiementTest(form: FormData): Promise<void> {
  await requirePermission("paiements", "creer");
  const scenario = form.get("scenario");
  await createTestPayment(typeof scenario === "string" && /^\d{7}$/.test(scenario) ? scenario : undefined);
  revalidatePath("/");
  revalidatePath("/paiements");
}

const userSchema = z.object({
  name: z.string().min(1, "Nom requis.").max(80),
  email: z.string().email("Adresse e-mail invalide."),
  password: z.string().min(12, "12 caractères minimum.").max(128),
  role: z.string().min(1, "Rôle requis."),
});

export async function creerUtilisateur(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("utilisateurs", "gerer");
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await createUser(parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/utilisateurs");
  return {};
}

export async function changerRole(form: FormData): Promise<void> {
  const session = await requirePermission("utilisateurs", "gerer");
  const userId = form.get("userId");
  const role = form.get("role");
  if (typeof userId !== "string" || typeof role !== "string") return;
  await setUserRole(userId, role, session.user.id);
  revalidatePath("/utilisateurs");
}

/** Lit la matrice de cases à cocher `perm:<ressource>:<action>` d'un formulaire de rôle. */
function permissionsFrom(form: FormData): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};
  for (const resource of RESOURCE_NAMES) {
    const actions = RESOURCES[resource].actions.filter((action) => form.get(`perm:${resource}:${action}`) === "on");
    if (actions.length > 0) permissions[resource] = [...actions];
  }
  return permissions;
}

export async function enregistrerRole(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("roles", "gerer");
  const name = form.get("name");
  if (typeof name !== "string") return { error: "Nom de rôle requis." };
  const label = form.get("label");
  const kycTier = form.get("kycTier");
  const all = form.get("all") === "on";
  const result = await saveRole(name, {
    ...(typeof label === "string" && label ? { label } : {}),
    ...(typeof kycTier === "string" && kycTier ? { kycTier } : {}),
    ...(all ? { all: true } : { permissions: permissionsFrom(form) }),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/roles");
  return {};
}

export async function supprimerRole(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("roles", "gerer");
  const name = form.get("name");
  if (typeof name !== "string") return { error: "Nom de rôle requis." };
  const result = await deleteRole(name);
  if (!result.ok) return { error: result.error };
  revalidatePath("/roles");
  return {};
}

/** Gèle ou dégèle un portefeuille : un compte gelé ne peut plus rien sortir. Réservé à `portefeuille.debiter`. */
export async function gelerPortefeuille(form: FormData): Promise<void> {
  await requirePermission("portefeuille", "debiter");
  const userId = form.get("userId");
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return;
  await setFrozen(userId, form.get("frozen") === "true");
  revalidatePath("/portefeuilles");
  revalidatePath(`/portefeuilles/${userId}`);
}

/** Enregistre les clés d'un agrégateur dans le coffre. Les champs laissés vides gardent leur valeur actuelle. */
export async function enregistrerCles(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("cles", "gerer");
  const id = form.get("provider");
  if (typeof id !== "string" || !/^[a-z]{3,20}$/.test(id)) return { error: "Agrégateur inconnu." };
  const values: Record<string, string> = {};
  for (const [name, value] of form) {
    if (name === "provider" || name.startsWith("$ACTION") || typeof value !== "string") continue;
    if (value.trim() !== "") values[name] = value.trim();
  }
  if (Object.keys(values).length === 0) return { error: "Renseignez au moins un champ." };
  try {
    await saveProvider(id, values);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/cles");
  return { message: "Clés enregistrées et chiffrées. L'agrégateur est actif." };
}

export async function supprimerCles(form: FormData): Promise<void> {
  await requirePermission("cles", "gerer");
  const id = form.get("provider");
  if (typeof id !== "string" || !/^[a-z]{3,20}$/.test(id)) return;
  await removeProvider(id);
  revalidatePath("/cles");
}

export async function ajouterDestinataire(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("webhooks", "gerer");
  const url = form.get("url");
  if (typeof url !== "string" || !z.string().url().safeParse(url).success) return { error: "Adresse invalide (https://…)." };
  try {
    const created = await addEndpoint(url);
    revalidatePath("/webhooks");
    return { message: `Destinataire ${created.url} ajouté.`, secret: created.secret };
  } catch (error) {
    return fail(error);
  }
}

export async function supprimerDestinataire(form: FormData): Promise<void> {
  await requirePermission("webhooks", "gerer");
  const id = form.get("id");
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
  await removeEndpoint(id);
  revalidatePath("/webhooks");
}

export async function renvoyerLivraison(form: FormData): Promise<void> {
  await requirePermission("webhooks", "gerer");
  const id = form.get("id");
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
  try {
    await resendDelivery(id);
  } catch {
    // L'échec est visible dans l'historique (statut et dernière erreur) : rien à ajouter ici.
  }
  revalidatePath("/webhooks");
}

/** Étape 1 de « mot de passe oublié » : la réponse est la même que le compte existe ou non (pas d'énumération). */
export async function demanderReinitialisation(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.string().email("Adresse e-mail invalide.").safeParse(form.get("email"));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!(await emailConfigured())) return { error: "L'envoi d'e-mails n'est pas configuré sur cette instance. Demandez à un administrateur de réinitialiser votre mot de passe." };
  const { auth } = await getAuth();
  try {
    await auth.api.requestPasswordReset({ body: { email: parsed.data, redirectTo: `${env().BETTER_AUTH_URL}/reinitialiser` } });
  } catch {
    /* même réponse en cas d'échec : on ne révèle rien */
  }
  return { message: "Si un compte existe pour cette adresse, un e-mail avec un lien de réinitialisation vient d'être envoyé." };
}

const resetSchema = z.object({ token: z.string().min(1), password: z.string().min(12, "12 caractères minimum.").max(128) });

/** Étape 2 : le jeton vient du lien reçu par e-mail. */
export async function reinitialiserMotDePasse(_: FormState, form: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { auth } = await getAuth();
  try {
    await auth.api.resetPassword({ body: { newPassword: parsed.data.password, token: parsed.data.token } });
  } catch {
    return { error: "Ce lien est invalide ou expiré. Refaites une demande." };
  }
  redirect("/login?reinitialise=1");
}

export async function enregistrerEmail(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("parametres", "gerer");
  const values: Record<string, unknown> = {};
  for (const name of ["host", "port", "security", "user", "password", "from"]) {
    const value = form.get(name);
    if (typeof value === "string" && value.trim() !== "") values[name] = value.trim();
  }
  try {
    await saveEmail(values);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/email");
  return { message: "Configuration enregistrée. Le mot de passe est chiffré." };
}

export async function supprimerEmail(): Promise<void> {
  await requirePermission("parametres", "gerer");
  await removeEmail();
  revalidatePath("/email");
}

export async function envoyerEmailTest(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("parametres", "gerer");
  const to = z.string().email("Adresse e-mail invalide.").safeParse(form.get("to"));
  if (!to.success) return { error: firstIssue(to.error) };
  try {
    await sendTestEmail(to.data);
  } catch (error) {
    return fail(error);
  }
  return { message: `E-mail de test envoyé à ${to.data}.` };
}

export async function enregistrerAlertes(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("parametres", "gerer");
  const rules: Record<string, boolean> = {};
  for (const [name, value] of form) if (name.startsWith("rule:")) rules[name.slice(5)] = value === "on";
  // Les cases décochées n'apparaissent pas dans le formulaire : on les envoie explicitement à faux.
  for (const id of String(form.get("ruleIds") ?? "").split(",").filter(Boolean)) rules[id] ??= false;
  const recipients = String(form.get("recipients") ?? "").split(/[\s,;]+/).filter(Boolean);
  const threshold = Number(form.get("lowBalanceThreshold") || 0);
  if (!Number.isInteger(threshold)) return { error: "Le seuil doit être un nombre entier." };
  try {
    await saveAlerts({ rules, recipients, lowBalanceThreshold: threshold });
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/alertes");
  return { message: "Alertes enregistrées." };
}

export async function envoyerAlerteTest(): Promise<FormState> {
  await requirePermission("parametres", "gerer");
  try {
    await sendTestAlert();
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/alertes");
  return { message: "Alerte de test envoyée." };
}

/** Rembourse un paiement réussi (total, ou partiel si un montant est saisi). Réservé à `paiements.rembourser`. */
export async function rembourser(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("paiements", "rembourser");
  const id = form.get("id");
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { error: "Paiement inconnu." };
  const brut = String(form.get("amount") ?? "").trim();
  const montant = brut === "" ? undefined : Number(brut);
  if (montant !== undefined && (!Number.isInteger(montant) || montant <= 0)) return { error: "Montant invalide : un entier positif est attendu (XOF et XAF n'ont pas de décimales)." };
  try {
    await refundPayment(id, montant);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/paiements/${id}`);
  revalidatePath("/paiements");
  return { message: montant ? `Remboursement de ${montant} demandé.` : "Remboursement total demandé." };
}
