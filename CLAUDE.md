# CLAUDE.md — Pont (nom de code)

Orchestrateur de paiement **BYOK, non-custodial** pour l'Afrique francophone. Le client connecte ses clés FedaPay / PayDunya / CinetPay / Kkiapay ; Pont unifie l'API, les webhooks, le sandbox et la sécurité. Pont ne détient jamais de fonds. Self-host gratuit à vie ; Pont Cloud payant (Pont y conserve les clés, chiffrées par client : `docs/plan/deploiement-cloud-selfhost.md`).

- Spécification : `docs/CAHIER-DES-CHARGES.md` (source de vérité du MVP)
- Recherche marché : `~/Brain/projets/20261026-1200-orchestrateur-paiement-afrique-francophone.md`

## Structure

| Dossier | Rôle |
|---|---|
| `packages/core` | Contrat partagé : modèle normalisé, statuts, `ProviderAdapter` |
| `packages/adapters/*` | Un adaptateur par agrégateur |
| `packages/sandbox` | Simulateur à numéros magiques |
| `packages/node`, `packages/react` | SDK TypeScript |
| `packages/server` | Serveur autonome (API `/v1`, `/admin`, `/hooks`, planificateur), coffre de clés chiffré, adaptateurs de stockage |
| `packages/store-convex`, `packages/store-prisma` | Stockage Convex / PostgreSQL (le registre et les portefeuilles : PostgreSQL uniquement) |
| `packages/ledger`, `packages/recipes` | Registre en partie double, portefeuilles, plafonds KYC ; recette « portefeuille » |
| `packages/cli` | CLI `pont` |
| `packages/auth` | Rôles et permissions de la fintech (`definePont`, `RoleSet`, modèles) |
| `packages/mcp` | Serveur MCP d'intégration |
| `apps/dashboard` | Next.js + Better Auth (SQLite), lit l'API `/admin` du serveur |
| `deploy/self-host` | `docker-compose` et `setup.sh` (Convex ou PostgreSQL) |
| `sdks/php`, `sdks/laravel` | SDK PHP |
| `plugins/woocommerce` | Passerelle WooCommerce |

## Règles

- TypeScript strict, aucun `any` (`unknown` + type guards), Zod aux frontières.
- Montants en unités entières (XOF/XAF).
- Un paiement ne passe à `succeeded` qu'après `adapter.verify()`.
- Statut `ambiguous` → vérification, jamais de nouvel essai chez un autre agrégateur.
- Jamais de secret en clair : ni dans les logs, ni dans les réponses, ni dans le code.
- Commits en français.
