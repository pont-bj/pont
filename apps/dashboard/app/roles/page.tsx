import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { FormulaireRole } from "@/components/formulaire-role";
import { getOverview } from "@/lib/pont";
import { propsCoque } from "@/lib/page";
import { requirePermission } from "@/lib/session";
import { enregistrerRole, supprimerRole } from "../actions";

export const dynamic = "force-dynamic";

export default async function Roles() {
  const session = await requirePermission("roles", "lire");
  const overview = await getOverview();
  const peutGerer = session.roles.can(session.user.role, "roles", "gerer");
  return (
    <Coque actif="/roles" titre="Paramètres" texte="Définissez qui peut faire quoi dans votre fintech. Les changements s'appliquent immédiatement." {...propsCoque(session, overview)}>
      <div className="space-y-4">
        {session.roles.names().map((name) => (
          <Section key={name} id={`role-${name}`}>
            <FormulaireRole name={name} definition={session.roles.get(name)} save={enregistrerRole} remove={supprimerRole} readOnly={!peutGerer} />
          </Section>
        ))}
        {peutGerer && (
          <Section id="nouveau-role">
            <h2 className="pt-4 text-lg font-semibold">Nouveau rôle</h2>
            <FormulaireRole save={enregistrerRole} />
          </Section>
        )}
      </div>
      <Sommaire
        sections={[
          ...session.roles.names().slice(0, 8).map((name) => ({ id: `role-${name}`, label: session.roles.get(name)?.label ?? name })),
          ...(peutGerer ? [{ id: "nouveau-role", label: "Nouveau rôle" }] : []),
        ]}
      />
    </Coque>
  );
}
