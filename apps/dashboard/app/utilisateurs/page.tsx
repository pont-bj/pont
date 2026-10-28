import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { FormulaireUtilisateur } from "@/components/formulaire-utilisateur";
import { getOverview } from "@/lib/pont";
import { listUsers } from "@/lib/roles";
import { propsCoque } from "@/lib/page";
import { requirePermission } from "@/lib/session";
import { changerRole, creerUtilisateur } from "../actions";

export const dynamic = "force-dynamic";

export default async function Utilisateurs() {
  const session = await requirePermission("utilisateurs", "lire");
  const [overview, users] = await Promise.all([getOverview(), listUsers()]);
  const peutGerer = session.roles.can(session.user.role, "utilisateurs", "gerer");
  const roles = session.roles.names().map((name) => ({ name, label: session.roles.get(name)?.label ?? name }));
  return (
    <Coque actif="/utilisateurs" titre="Paramètres" texte="Les personnes qui accèdent à ce dashboard, et leur rôle." {...propsCoque(session, overview)}>
      {peutGerer && (
        <Section id="nouveau">
          <FormulaireUtilisateur action={creerUtilisateur} roles={roles} />
        </Section>
      )}
      <Section id="liste" className="overflow-x-auto rounded-2xl border border-bordure bg-white">
      <div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-bordure text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Utilisateur</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bordure">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-zinc-500">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  {peutGerer ? (
                    <form action={changerRole} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <select name="role" defaultValue={user.role ?? ""} aria-label={`Rôle de ${user.name}`} className="rounded-lg border border-bordure bg-white px-2 py-1.5 text-sm">
                        {user.role && !session.roles.has(user.role) && <option value={user.role}>{user.role} (supprimé)</option>}
                        {roles.map((role) => (
                          <option key={role.name} value={role.name}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                      <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo hover:bg-indigo-50">Appliquer</button>
                    </form>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium">{user.role ?? "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-500">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(user.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Section>
      {peutGerer && <Sommaire
        sections={[
          { id: "nouveau", label: "Nouvel utilisateur" },
          { id: "liste", label: "Utilisateurs" },
        ]}
      />}
    </Coque>
  );
}
