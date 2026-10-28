# CLAUDE.md — Pont (nom de code)

Orchestrateur de paiement **BYOK, non-custodial** pour l'Afrique francophone. Le développeur connecte ses propres clés FedaPay / PayDunya / PawaPay / Kkiapay / CinetPay ; Pont unifie l'API, les webhooks, le sandbox et la sécurité. Pont ne détient jamais de fonds. Statut : `0.x`, en sandbox, aucun vrai agrégateur éprouvé en production. Le nom est provisoire.

- Spécification : `docs/CAHIER-DES-CHARGES.md`
- Documentation self-host : `docs/self-host/README.md`
- Règles métier : `docs/metier/regles.md`
- Feuille de route : `docs/ROADMAP.md`

## Structure

| Dossier | Rôle |
|---|---|
| `packages/core` | Contrat partagé : modèle normalisé, statuts, `ProviderAdapter` |
| `packages/adapters/*` | Un adaptateur par agrégateur |
| `packages/engine` | Moteur : idempotence, routage, réconciliation |
| `packages/sandbox` | Simulateur à numéros magiques |
| `packages/node` | SDK TypeScript |
| `packages/server` | Serveur autonome (API `/v1`, `/admin`, `/hooks`, planificateur) |
| `packages/store-convex`, `packages/store-prisma` | Stockage Convex / PostgreSQL |
| `packages/ledger`, `packages/recipes` | Registre en partie double, portefeuilles |
| `packages/cli`, `packages/mcp`, `packages/auth` | CLI, serveur MCP, rôles |
| `apps/dashboard`, `apps/docs`, `apps/landing` | Applications Next.js |
| `deploy/self-host` | `docker-compose` et `setup.sh` |

## Règles

- TypeScript strict, aucun `any` (`unknown` + type guards), Zod aux frontières.
- Montants en unités entières (XOF/XAF).
- Un paiement ne passe à `succeeded` qu'après `adapter.verify()`.
- Statut `ambiguous` : vérification, jamais de nouvel essai chez un autre agrégateur.
- Jamais de secret en clair : ni dans les logs, ni dans les réponses, ni dans le code, ni dans les tests (fixtures évidemment fictives).
- Messages de commit en français. Voir `CONTRIBUTING.md`.
