# Contribuer à Pont

Merci de l'intérêt que tu portes à Pont. Ce guide explique comment proposer une correction ou une amélioration. En participant, tu acceptes le [Code de conduite](CODE_OF_CONDUCT.md).

## Prérequis

- Node.js 20 ou plus (LTS recommandée)
- pnpm 10 (la version exacte est fixée par le champ `packageManager` de `package.json` ; active-la avec `corepack enable`)
- Docker, uniquement si tu veux exécuter les tests contre un vrai PostgreSQL

## Installation

```bash
git clone https://github.com/pont-bj/pont
cd pont
pnpm install --frozen-lockfile
```

## Tests, typecheck, build

```bash
pnpm typecheck   # tsc sur tous les packages (équivaut à pnpm -r typecheck)
pnpm test        # vitest sur tous les packages (équivaut à pnpm -r test)
pnpm build       # build de tous les packages
```

Il n'y a pas de script `lint` global pour l'instant : le typecheck strict fait foi.

Les tests de `packages/store-prisma` utilisent un PostgreSQL sur `localhost:55432` (ou la variable `DATABASE_URL`). S'il est injoignable, ces tests sont ignorés (et non en échec). Pour les exécuter :

```bash
docker run -d --name pont-test-pg -p 55432:5432 \
  -e POSTGRES_PASSWORD=pont -e POSTGRES_DB=pont_test postgres:16
```

Puis crée le schéma : `pnpm --filter @pont-bj/store-prisma exec prisma db push`.

Aucun test ne doit contacter le réseau ni un vrai agrégateur.

## Structure du monorepo

| Dossier | Rôle |
|---|---|
| `packages/core` | Contrat partagé : modèle normalisé, statuts, `ProviderAdapter` |
| `packages/adapters/*` | Un adaptateur par agrégateur |
| `packages/sandbox` | Simulateur à numéros magiques |
| `packages/node`, `packages/react` | SDK TypeScript |
| `packages/server` | Serveur autonome (API, webhooks, planificateur, coffre de clés) |
| `packages/store-convex`, `packages/store-prisma` | Stockage Convex / PostgreSQL |
| `packages/ledger`, `packages/recipes` | Registre en partie double, portefeuilles |
| `packages/cli`, `packages/mcp`, `packages/auth` | CLI, serveur MCP, rôles et permissions |
| `apps/dashboard`, `apps/docs`, `apps/landing` | Interfaces web |
| `deploy/self-host` | `docker-compose` et `setup.sh` |
| `sdks/*`, `plugins/*` | SDK PHP, passerelle WooCommerce |

Détails : [`CLAUDE.md`](CLAUDE.md) et [`docs/`](docs/).

## Conventions

- TypeScript strict, **aucun `any`** : utilise `unknown` et des type guards.
- **Zod** à toutes les frontières (requêtes, webhooks, variables d'environnement, réponses d'agrégateurs).
- **Pas de SQL brut** : Prisma uniquement (ou requêtes préparées).
- **Jamais de secret en dur** ni dans les logs, réponses ou jeux de test : variables d'environnement uniquement.
- **Montants en entiers** (unités de la devise, XOF/XAF), jamais de flottants.
- Un paiement ne passe à `succeeded` qu'après `adapter.verify()`. Un statut `ambiguous` se vérifie, on ne retente jamais chez un autre agrégateur.
- **Commits en français**, style conventionnel : `feat(scope): …`, `fix(scope): …`, `docs: …`, `test: …`, `refactor: …`, `chore: …`. Exemple : `fix(ledger): refuse un transfert vers le même portefeuille`.
- Textes, documentation et messages d'erreur destinés aux humains : en français.

## Flux de travail

1. Ouvre d'abord une issue pour toute évolution non triviale, afin d'en discuter avant d'écrire du code.
2. Fais un fork, puis crée une branche depuis `main` (`feat/nom-court`, `fix/nom-court`).
3. Fais des commits petits et cohérents.
4. Avant d'ouvrir la PR : `pnpm typecheck` et `pnpm test` doivent passer.
5. Ouvre la PR en remplissant le modèle fourni. Une PR = un sujet.

## Règles de revue

- Au moins une approbation d'un mainteneur et une CI verte sont requises pour fusionner.
- Tout changement de comportement s'accompagne de tests ; tout changement public, de documentation.
- Les relectures portent sur le code, jamais sur la personne. Les retours sont à traiter ou à discuter ; le mainteneur tranche en cas de désaccord (voir [`GOVERNANCE.md`](GOVERNANCE.md)).
- Une PR sans activité pendant 30 jours après une demande de modification peut être fermée.

## Ce qui est accepté, ce qui est refusé

Accepté : corrections de bugs, tests, documentation, nouveaux adaptateurs d'agrégateurs (discuter d'abord en issue), améliorations de sécurité et de performance, traductions.

Refusé :

- Tout appel réel à un agrégateur ou à une API tierce dans les tests ou la CI : les adaptateurs se testent **en sandbox uniquement** (serveurs simulés, numéros magiques, `fetch` injecté).
- Tout secret, clé, jeton ou donnée personnelle réelle dans le dépôt, même expirés.
- Du code qui détient ou déplace des fonds pour le compte de tiers : Pont reste non-custodial.
- Les dépendances ajoutées sans justification, ou de licence incompatible.
- Le code généré dont tu ne peux pas garantir l'origine et les droits (voir l'accord ci-dessous).

## Signaler un bug

Ouvre une issue avec le modèle « Bug » : version, étapes de reproduction, comportement attendu et observé, logs **sans secret**. Pour une faille de sécurité, **n'ouvre jamais d'issue publique** : suis [`SECURITY.md`](SECURITY.md).

## Accord de contribution

Avant la fusion de ta première contribution, tu dois accepter l'accord de contribution décrit dans [`CLA.md`](CLA.md). Il permet au propriétaire du projet de le distribuer, y compris sous d'autres licences, quelle que soit la licence finalement retenue pour le code.

Collecte : l'accord n'est pas géré par un service tiers. Dans ta première PR, ajoute en commentaire exactement la phrase : « J'ai lu l'accord de contribution (CLA.md) et je l'accepte pour cette contribution et les suivantes. » Un mainteneur consigne ta signature (identifiant GitHub, date, hash du commit) dans un registre privé et pose le label `cla-signé`. Sans ce label, la PR n'est pas fusionnée.

## Documentation

- [README](README.md) et [`docs/self-host/`](docs/self-host/README.md) : installation et exploitation
- [`docs/self-host/api.md`](docs/self-host/api.md) : référence de l'API
- [`docs/self-host/adaptateurs-stockage.md`](docs/self-host/adaptateurs-stockage.md) : écrire un adaptateur de stockage
- [`docs/CAHIER-DES-CHARGES.md`](docs/CAHIER-DES-CHARGES.md) : spécification du MVP
