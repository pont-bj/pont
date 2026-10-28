# @pont-bj/node

Moteur Pont dans votre backend. Vos clés d'agrégateur restent dans vos variables d'environnement.

## Variables d'environnement

```bash
PONT_MODE=test                      # test | live
PONT_PUBLIC_URL=https://boutique.bj # pour les URL de webhooks agrégateurs
PONT_SANDBOX=true                   # tester sans aucun compte agrégateur (interdit en live)

# Un agrégateur est activé dès que ses variables sont présentes
FEDAPAY_SECRET_KEY=  FEDAPAY_WEBHOOK_SECRET=
PAWAPAY_API_TOKEN=   PAWAPAY_CALLBACK_PUBLIC_KEYS='{"<keyid>":"<PEM>"}'
PAYDUNYA_MASTER_KEY= PAYDUNYA_PRIVATE_KEY= PAYDUNYA_TOKEN= PAYDUNYA_STORE_NAME=
KKIAPAY_PUBLIC_KEY=  KKIAPAY_PRIVATE_KEY=  KKIAPAY_SECRET_KEY= KKIAPAY_WEBHOOK_SECRET=
```

Kkiapay ne peut pas être combiné avec un autre agrégateur (CGU Art. 18).

## Next.js

```ts
// lib/pont.ts
import { createPontFromEnv } from "@pont-bj/node";
export const pont = createPontFromEnv();

// app/api/pont/hooks/[provider]/route.ts
import { createWebhookRoute } from "@pont-bj/node";
import { pont } from "@/lib/pont";
export const { POST } = createWebhookRoute(pont);

// Server Action
const payment = await pont.createPayment(
  { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "0197000001" }, reference: order.id },
  `order-${order.id}`, // clé d'idempotence
);
```

Numéros magiques du sandbox : `…0000001` succès, `…0000002` solde insuffisant, `…0000003` jamais confirmé, `…0000007` timeout ambigu, `…0000008` refus client.
