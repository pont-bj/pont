import { z } from "zod";
import { RESOURCES, RESOURCE_NAMES, type Resource } from "./catalog.js";

/** Nom de rôle : minuscules, chiffres, tiret et tiret bas. Il est stocké tel quel sur l'utilisateur. */
export const roleNameSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-z][a-z0-9_-]*$/, "Minuscules, chiffres, - et _ uniquement, en commençant par une lettre.");

const permissionsSchema = z
  .record(z.string(), z.array(z.string()))
  .superRefine((permissions, ctx) => {
    for (const [resource, actions] of Object.entries(permissions)) {
      if (!(resource in RESOURCES)) {
        ctx.addIssue({ code: "custom", path: [resource], message: `Ressource inconnue : ${resource}.` });
        continue;
      }
      const known: readonly string[] = RESOURCES[resource as Resource].actions;
      for (const action of actions) {
        if (!known.includes(action)) ctx.addIssue({ code: "custom", path: [resource], message: `Action inconnue pour ${resource} : ${action}.` });
      }
    }
  });

export const roleDefinitionSchema = z
  .object({
    label: z.string().min(1).max(60).optional(),
    description: z.string().max(200).optional(),
    /** Accès total (rôle administrateur). Incompatible avec `permissions`. */
    all: z.literal(true).optional(),
    permissions: permissionsSchema.default({}),
    /** Palier KYC appliqué par défaut aux utilisateurs de ce rôle (clé de `LimitsConfig.tiers` du registre). */
    kycTier: z.string().min(1).max(32).optional(),
  })
  .strict()
  .refine((role) => !(role.all && Object.keys(role.permissions).length > 0), "Un rôle « accès total » n'a pas de permissions détaillées.");

export type RoleDefinition = z.infer<typeof roleDefinitionSchema>;

/** Forme acceptée en configuration : `permissions` facultatif, listes en lecture seule (`as const`). */
export interface RoleInput {
  label?: string;
  description?: string;
  all?: true;
  permissions?: Record<string, readonly string[]>;
  kycTier?: string;
}
export type RoleMap = Record<string, RoleInput>;

export const rolesSchema = z.record(roleNameSchema, roleDefinitionSchema).refine((roles) => Object.keys(roles).length > 0, "Au moins un rôle.");

/** Ensemble de rôles validé, avec la vérification des permissions. */
export class RoleSet {
  private constructor(private readonly roles: ReadonlyMap<string, RoleDefinition>) {}

  /** Valide et construit. Lève une erreur lisible si un rôle est invalide. */
  static from(input: unknown): RoleSet {
    const result = rolesSchema.safeParse(input);
    if (!result.success) {
      throw new Error(`Rôles invalides : ${result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")}`);
    }
    return new RoleSet(new Map(Object.entries(result.data)));
  }

  has(role: string): boolean {
    return this.roles.has(role);
  }

  names(): string[] {
    return [...this.roles.keys()];
  }

  get(role: string): RoleDefinition | undefined {
    return this.roles.get(role);
  }

  /** Vrai si le rôle a la permission. Un rôle inconnu n'a aucune permission. */
  can(role: string | null | undefined, resource: Resource, action: string): boolean {
    if (!role) return false;
    const definition = this.roles.get(role);
    if (!definition) return false;
    if (definition.all) return true;
    return definition.permissions[resource]?.includes(action) ?? false;
  }

  /** Permissions effectives d'un rôle, pour l'afficher ou les renvoyer à une application. */
  permissionsOf(role: string): Record<string, string[]> {
    const definition = this.roles.get(role);
    if (!definition) return {};
    if (definition.all) return Object.fromEntries(RESOURCE_NAMES.map((resource) => [resource, [...RESOURCES[resource].actions]]));
    return Object.fromEntries(Object.entries(definition.permissions).filter(([, actions]) => actions.length > 0));
  }

  toJSON(): Record<string, RoleDefinition> {
    return Object.fromEntries(this.roles);
  }
}

/** Point d'entrée de `pont.config.ts` : `export default definePont({ roles: { … } })`. */
export function definePont<const T extends { roles: RoleMap }>(config: T): T {
  RoleSet.from(config.roles);
  return config;
}
