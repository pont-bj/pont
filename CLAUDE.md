# CLAUDE.md — Pont (nom de code)

Orchestrateur de paiement **BYOK, non-custodial** pour l'Afrique francophone. Le client connecte ses clés FedaPay / PayDunya / CinetPay / Kkiapay ; Pont unifie l'API, les webhooks, le sandbox et la sécurité. Pont ne détient jamais de fonds.

- Spécification : `docs/CAHIER-DES-CHARGES.md` (source de vérité du MVP)
- Recherche marché : `~/Brain/projets/20261026-1200-orchestrateur-paiement-afrique-francophone.md`

## Structure

| Dossier | Rôle |
|---|---|
| `packages/core` | Contrat partagé : modèle normalisé, statuts, `ProviderAdapter` |
| `packages/adapters/*` | Un adaptateur par agrégateur |
| `packages/sandbox` | Simulateur à numéros magiques |
| `packages/node`, `packages/react` | SDK TypeScript |
| `packages/cli` | CLI `pont` |
| `packages/mcp` | Serveur MCP d'intégration |
| `apps/dashboard` | Next.js + Convex + shadcn/ui |
| `sdks/php`, `sdks/laravel` | SDK PHP |
| `plugins/woocommerce` | Passerelle WooCommerce |

## Règles

- TypeScript strict, aucun `any` (`unknown` + type guards), Zod aux frontières.
- Montants en unités entières (XOF/XAF).
- Un paiement ne passe à `succeeded` qu'après `adapter.verify()`.
- Statut `ambiguous` → vérification, jamais de nouvel essai chez un autre agrégateur.
- Jamais de secret en clair : ni dans les logs, ni dans les réponses, ni dans le code.
- Commits en français.
