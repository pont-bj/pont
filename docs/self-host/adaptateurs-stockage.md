# Adaptateurs de stockage : brancher sa base de données

Le serveur Pont ne sait pas où sont stockées les données : il parle à des **interfaces**. Un adaptateur de stockage fournit l'implémentation. Trois sont livrés ; vous pouvez écrire le vôtre.

| Adaptateur | `PONT_STORE` | Durable | Où |
|---|---|---|---|
| Mémoire | `memory` | non | `memoryStorage` : tests uniquement |
| Convex | `convex` | oui | `@pont-bj/store-convex` (Convex self-hosted ou cloud) |
| PostgreSQL | `postgres` | oui | `@pont-bj/store-prisma` (via Prisma) |

En mode `live`, un adaptateur non durable est refusé au démarrage.

## Brancher votre PostgreSQL

Aucun code : une variable suffit.

```bash
# deploy/self-host/.env
PONT_STORE=postgres
DATABASE_URL=postgresql://utilisateur:motdepasse@hote:5432/base
```

```bash
./setup.sh --store postgres
```

Si `DATABASE_URL` est renseignée, aucun conteneur PostgreSQL n'est lancé : Pont utilise votre base et y crée ses tables (préfixe `pont_`, voir `packages/store-prisma/prisma/schema.prisma`) avec `prisma db push`. Utilisez un compte de base dédié. Les enregistrements sont stockés en JSONB ; des colonnes à côté servent aux index.

Sans Docker :

```bash
export DATABASE_URL=postgresql://…
pnpm --filter @pont-bj/store-prisma exec prisma db push
PONT_STORE=postgres pnpm --filter @pont-bj/server start
```

## Écrire votre propre adaptateur

Pour MySQL, MongoDB, DynamoDB ou toute autre base, implémentez les cinq interfaces du moteur (`@pont-bj/engine`) et retournez-les dans un `StorageAdapter`. Le serveur s'utilise alors comme une bibliothèque :

```ts
import { createRuntime, type StorageFactory } from "@pont-bj/server";

const monStockage: StorageFactory = async (env) => ({
  payments: new MonPaymentStore(/* … */),
  payouts: new MonPayoutStore(/* … */),
  refunds: new MonRefundStore(/* … */),
  idempotency: new MonIdempotencyStore(/* … */),
  deliveries: new MonDeliveryStore(/* … */),
  durable: true,
  close: async () => { /* fermer les connexions */ },
});

const runtime = await createRuntime(process.env, { storage: monStockage });
// runtime.handle(request) : (Request) => Promise<Response>, utilisable avec Node, Bun, Deno, Workers…
```

### Les interfaces à implémenter

**`RecordStore<T>`** : `PaymentStore`, `PayoutStore` et `RefundStore` (qui ajoute `listByPayment`).

| Méthode | Comportement attendu |
|---|---|
| `get(id)` | L'enregistrement ou `null` |
| `findByAttempt(provider, attemptId)` | Retrouve par identifiant de tentative |
| `findByProviderRef(provider, providerRef)` | Retrouve par référence de l'agrégateur |
| `insert(record)` | Échoue si l'`id` existe déjà |
| `update(record)` | Échoue si l'`id` n'existe pas |
| `listUnsettled(updatedBefore, limit)` | Opérations non réglées (voir `isUnsettled`), les plus anciennes d'abord : sert à la réconciliation |
| `listRecent(limit)` | Les plus récemment mises à jour d'abord : sert au dashboard |

**`IdempotencyStore`**
- `get(key)` renvoie `{ fingerprint, recordId }` ou `null`.
- `putIfAbsent(key, record)` doit être **atomique** et renvoyer `false` si la clé existe. C'est ce qui garantit qu'aucune requête concurrente ne crée deux paiements : utilisez une contrainte d'unicité ou une transaction sérialisable, jamais « lire puis écrire ».

**`DeliveryStore`** (livraison des webhooks sortants) : `insert`, `update`, `get`, `due(now, limit)` (livraisons `pending` dont `nextAttemptAt <= now`).

### Règles à respecter

- Stockez l'objet complet (JSON) : les `metadata` du marchand sont libres.
- Aucune clé d'agrégateur ne passe par le stockage : seulement les opérations (numéro en E.164, montants, statuts).
- Les montants sont des entiers.
- Ne renvoyez jamais d'objets partagés mutables : renvoyez des copies.
- Voyez `MemoryRecordStore` (`packages/engine/src/store.ts`) comme référence de comportement, et `packages/store-prisma/test/store.test.ts` comme modèle de tests, y compris le test de concurrence sur l'idempotence.

Il n'y a pas encore de suite de tests de conformité réutilisable : copiez et adaptez ces tests pour valider votre adaptateur.

## Ce qui n'est pas dans l'adaptateur

Les comptes du dashboard (Better Auth) ont leur propre base SQLite. Le portefeuille et le registre (`@pont-bj/ledger`) auront leur propre adaptateur lorsqu'ils seront branchés au serveur.
