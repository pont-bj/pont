# @pont/store-convex

Stockage persistant de Pont sur Convex : paiements, retraits, remboursements, idempotence, livraisons de webhooks.

## Installation dans votre projet

1. Copiez `convex/pontStore.ts` dans le dossier `convex/` de votre projet.
2. Ajoutez les tables Pont à votre schéma :

   ```ts
   // convex/schema.ts
   import { defineSchema } from "convex/server";
   import { pontTables } from "@pont/store-convex/convex/schema";

   export default defineSchema({ ...vosTables, ...pontTables });
   ```

3. Générez un secret d'au moins 32 caractères (`openssl rand -hex 32`) et définissez-le **des deux côtés** :
   - Convex : `npx convex env set PONT_STORE_SECRET <secret>`
   - Backend : `PONT_STORE_SECRET=<secret>` et `CONVEX_URL=<url du déploiement>`

4. Branchez les stores :

   ```ts
   import { ConvexHttpClient } from "convex/browser";
   import { createConvexStores } from "@pont/store-convex";
   import { createPontFromEnv, WebhookRelay } from "@pont/node";

   const stores = createConvexStores({
     client: new ConvexHttpClient(process.env.CONVEX_URL!),
     secret: process.env.PONT_STORE_SECRET!,
   });
   export const relay = new WebhookRelay({ mode: "live", endpoints: [...], store: stores.deliveries });
   export const pont = createPontFromEnv({ stores, onEvent: (event) => relay.enqueue(event) });
   ```

5. Job planifié (réconciliation + livraison des webhooks) :

   ```ts
   // app/api/pont/cron/route.ts
   export const { GET } = createCronRoute(pont, { relay, secret: process.env.CRON_SECRET });
   ```

   ```json
   // vercel.json
   { "crons": [{ "path": "/api/pont/cron", "schedule": "*/5 * * * *" }] }
   ```

## Sécurité

- Les fonctions sont publiques au sens Convex mais exigent `PONT_STORE_SECRET` à chaque appel. Ne l'exposez jamais côté navigateur.
- Aucune clé d'agrégateur n'est stockée : seulement les opérations (numéro du client en E.164, montants, statuts).
- Les enregistrements sont stockés en JSON pour accepter toutes les métadonnées du marchand.
- L'idempotence repose sur une mutation Convex (sérialisable) : deux requêtes concurrentes avec la même clé ne créent jamais deux paiements.
