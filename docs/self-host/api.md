# API du serveur Pont

Base : `http://localhost:8787`. Toutes les réponses sont en JSON. Les montants sont des **entiers** (XOF/XAF sans décimales).

## Authentification

| Routes | En-tête |
|---|---|
| `/v1/*` | `Authorization: Bearer <PONT_API_KEY>` : pour votre application |
| `/admin/*` | `Authorization: Bearer <PONT_ADMIN_TOKEN>` : pour le dashboard |
| `/hooks/<agrégateur>` | Aucune : la signature du webhook est vérifiée |
| `/health` | Aucune |

Sans jeton valide : `401`. La clé API ne donne pas accès à `/admin`, et inversement.

## Idempotence

`POST /v1/payments` et `POST /v1/payouts` sont idempotents.

- **Par défaut**, Pont déduit la clé de la `reference` : renvoyer la même référence renvoie le même paiement, sans double débit.
- **En-tête `Idempotency-Key`** (8 à 255 caractères) : prioritaire si présent.
- Même clé avec un contenu différent : `409 idempotency_conflict`.
- Pour retenter un paiement échoué : nouvelle `reference` (`commande-42-2`) ou autre `Idempotency-Key`.
- Sans `reference` ni en-tête : `400`.

Un remboursement est idempotent par paiement et par montant (ou par `Idempotency-Key`).

## Paiements

### `POST /v1/payments`

```json
{
  "amount": 5000,
  "currency": "XOF",
  "country": "BJ",
  "customer": { "phone": "+2290100000001", "name": "Awa", "email": "awa@exemple.bj" },
  "reference": "commande-42",
  "description": "Commande 42",
  "operator": "mtn_bj",
  "method": "mobile_money",
  "returnUrl": "https://boutique.bj/merci",
  "metadata": { "panier": "abc" }
}
```

Obligatoires : `amount`, `currency` (`XOF` ou `XAF`), `country`, `customer.phone`, `reference` (64 caractères max). Les autres champs sont facultatifs. Réponse `201` avec le paiement.

### `GET /v1/payments/:id`
Lit un paiement (sans interroger l'agrégateur).

### `POST /v1/payments/:id/refresh`
Interroge l'agrégateur et met à jour le statut.

### `POST /v1/payments/:id/refunds`
Corps : `{ "amount": 2000 }` (facultatif : remboursement total sans montant). Réponse `201`.

Statuts : `pending`, `processing`, `succeeded`, `failed`, `expired`, `cancelled`, `refunded`, `partially_refunded`.

## Retraits

`POST /v1/payouts` : même forme que les paiements, avec `recipient` à la place de `customer` et `operator` obligatoire. `GET /v1/payouts/:id`, `POST /v1/payouts/:id/refresh`.

## Portefeuilles

`/v1/wallets/*` : ouverture, solde, dépôts, retraits, transferts. Voir [portefeuille et registre](portefeuille-et-registre.md). Répond `501` si le stockage n'a pas de registre.

## Dashboard (`/admin`)

| Route | Rôle |
|---|---|
| `GET /admin/overview` | Volume, nombre et taux de réussite, derniers paiements et retraits |
| `GET /admin/payments?limit=50` | Paiements, du plus récent au plus ancien (200 max) |
| `GET /admin/payments/<id>` | Un paiement, ses remboursements et sa chronologie (création, statut, livraisons de webhooks) |
| `POST /admin/payments/<id>/refund` | Rembourse (corps facultatif `{ "amount": 1000 }`, total sinon) |
| `GET /admin/coverage`, `GET /admin/providers-health` | Couverture par pays et état par agrégateur (taux de réussite sur 1 h, calculé depuis les paiements récents) |
| `GET /admin/payouts?limit=50` | Retraits |
| `GET /admin/wallets`, `GET /admin/wallets/<user>`, `POST /admin/wallets/<user>/freeze`, `GET /admin/ledger` | Portefeuilles et registre |
| `/admin/providers*`, `/admin/webhooks*` | Clés des agrégateurs et destinataires de webhooks : voir [clés et webhooks](cles-et-webhooks.md) |
| `POST /admin/test-payment` | Paiement de test (sandbox uniquement, `403` sinon). Corps facultatif : `{ "scenario": "0000002" }` |

## Webhooks

**Entrants.** Déclarez `https://<votre-serveur>/hooks/<agrégateur>` chez l'agrégateur (`fedapay`, `pawapay`, `paydunya`, `kkiapay`). Signature invalide : `401`. Opération inconnue ou doublon : `200` (l'agrégateur ne réessaie pas pour rien).

**Sortants.** Avec `PONT_WEBHOOK_URL` ou des destinataires ajoutés dans le dashboard, Pont envoie vos événements (`payment.succeeded`, `payment.failed`, `payout.succeeded`, `refund.succeeded`…) en `POST`, signés dans l'en-tête `Pont-Signature`. Livraison au moins une fois, avec relances sur environ 3 jours. Vérifiez la signature sur le **corps brut** :

```ts
import { verifyPontSignature } from "@pont-bj/node";
const ok = verifyPontSignature(process.env.PONT_WEBHOOK_SECRET!, rawBody, request.headers.get("pont-signature"));
```

## Erreurs

```json
{ "error": { "code": "invalid_request", "message": "La requête est invalide. …" } }
```

| Code | HTTP |
|---|---|
| `invalid_request` | 400 |
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `payment_not_found`, `not_found` | 404 |
| `idempotency_conflict`, `invalid_transition` | 409 |
| `amount_not_allowed`, `invalid_phone`, `no_provider_available`, `limit_exceeded`, `insufficient_funds`, `withdrawal_failed` | 422 |
| `ledger_unavailable` | 501 |
| `provider_rejected` | 502 |
| `internal_error`, `configuration_error` | 500 |
