import type { Overview } from "./pont";
import type { requireSession } from "./session";

type Session = Awaited<ReturnType<typeof requireSession>>;

/** Propriétés communes de la coque, tirées de la session et de l'aperçu serveur. */
export function propsCoque(session: Session, shell: Pick<Overview, "sandbox" | "mode" | "features">) {
  return {
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    roles: session.roles,
    sandbox: shell.sandbox,
    mode: shell.mode,
    wallet: shell.features.wallet,
  };
}
