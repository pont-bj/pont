# Fidélité du code à la documentation des agrégateurs

Aucun test réel en sandbox n'est possible pour l'instant (décision du 2026-10-27). Ce tableau dit, pour chaque comportement codé, s'il vient **mot pour mot de la doc officielle** (dans `docs/providers/`), d'une **déduction** raisonnable, ou d'une **hypothèse** à surveiller en production.

Règle de sécurité qui compense : un statut inconnu ne devient **jamais** un succès (il reste `pending` / `processing`), et tout succès est relu par API avec contrôle du montant (R-001, R-013).

## FedaPay

| Comportement | Source |
|---|---|
| URLs sandbox/live, auth Bearer, `POST /transactions`, `POST /transactions/{id}/token`, `GET /transactions/{id}` | ✅ OpenAPI |
| Paiement direct `POST /transactions/{mode}` avec `token` + `phone_number` | ✅ OpenAPI ; codes officiels (`payment-methods.md`) : `mtn_open`, `moov`, `sbin`, `moov_tg`, `togocel`, `mtn_ci`, `free_sn`. **Corrigé le 2026-10-27** : `mtn` (exemple d'une autre page) remplacé par `mtn_open` |
| Opérateurs couverts par pays (checkout hébergé et retraits) | ✅ `payment-methods.md` |
| Réponses sous la clé `v1/transaction` ou à plat | 🔶 déduction (SDK officiels vs OpenAPI) : les deux formes sont gérées |
| Statuts `pending`, `approved`, `canceled`, `transferred` | ✅ OpenAPI ; `declined` déduit de l'événement `transaction.declined` |
| Signature webhook `X-FEDAPAY-SIGNATURE: t=…,s=HMAC_SHA256(t.body)`, tolérance 300 s | ✅ code source du SDK officiel (`docs/providers/fedapay/sdk-Webhook.ts`) |
| Payouts : `POST /payouts` (avec le `mode` officiel) puis `PUT /payouts/start {payouts:[{id}]}` | ✅ guide payouts + `payment-methods.md` |
| Statuts payout `pending → started → processing → sent / failed` | ✅ guide payouts |
| Préfixe `payout.` dans le nom des événements de payout | ⚠️ hypothèse (seuls les événements `transaction.*` sont listés) |

## PawaPay

| Comportement | Source |
|---|---|
| Dépôts, payouts, remboursements : endpoints, champs, `depositId`/`payoutId`/`refundId` UUID idempotents, `DUPLICATE_IGNORED` | ✅ doc v2 |
| `UNKNOWN_ERROR` / 5xx → jamais un échec ; seul `NOT_FOUND` permet de conclure | ✅ doc v2 |
| Statuts `ACCEPTED`, `ENQUEUED`, `SUBMITTED`, `PROCESSING`, `IN_RECONCILIATION`, `COMPLETED`, `FAILED` | ✅ doc v2 + numéros de test |
| Remboursement partiel `amount` + `currency`, rejet `rejectionReason.rejectionCode` (`AMOUNT_TOO_LARGE`) | ✅ guide refunds |
| Codes opérateurs (`MTN_MOMO_BEN`…) et modes d'autorisation | ✅ page providers |
| Signatures RFC 9421 : base de signature, composants, algorithmes, ECDSA en DER | ✅ section « Signatures in API » (exemple `MEQCI…` = DER) |
| `authorizationUrl` dans la réponse d'initiation (Wave) | 🔶 déduction (`nextStep: REDIRECT_TO_AUTH_URL` documenté ; peut arriver plus tard via la vérification) |
| Numéros de test Bénin à 8 chiffres | ✅ page test numbers → tolérés en mode test uniquement |

## PayDunya

| Comportement | Source |
|---|---|
| `checkout-invoice/create` + `confirm/{token}`, en-têtes `PAYDUNYA-*`, URLs sandbox/live | ✅ doc HTTP/JSON |
| Statuts facture `pending`, `completed`, `cancelled`, `failed` | ✅ doc |
| Hash IPN = SHA-512(master key), IPN en `x-www-form-urlencoded` sous `data[...]` | ✅ doc (Node/Ruby) |
| Retraits `get-invoice` → `submit-invoice` → `check-status`, `withdraw_mode`, `account_alias` sans indicatif, XOF entier | ✅ doc déboursement |
| Statuts retrait `created`, `pending`, `success`, `failed` | ✅ doc |
| Corps du callback de retrait en JSON | ⚠️ hypothèse (exemple affiché en JSON, Content-Type non précisé) : JSON et formulaire acceptés |
| Endpoints de retrait sans variante sandbox (`/api/v2/disburse`) | ⚠️ la doc ne montre que l'URL de production |

## Kkiapay

| Comportement | Source |
|---|---|
| `POST /api/v1/transactions/status` et `/revert`, en-têtes `x-api-key`, `x-private-key`, `x-secret-key`, URLs sandbox/live | ✅ SDK officiel Node (`docs/providers/kkiapay/sdk/`) |
| Statuts `SUCCESS`, `FAILED` | ✅ exemples de la doc ; tout autre statut reste `pending` |
| Webhook `x-kkiapay-secret` = secret saisi dans le dashboard | ✅ doc |
| Remboursement total seulement, mobile money réussi, frais non rendus | ✅ doc |
| Champ `partnerId` renvoyé par la vérification | ✅ exemple de réponse du SDK |
| Réponse et suivi d'un remboursement | ⚠️ non documentés : reste `processing`, à confirmer dans le dashboard |

## CinetPay (expérimental, désactivé par défaut)

| Comportement | Source |
|---|---|
| `POST https://api-checkout.cinetpay.com/v2/payment` et ses champs, montant multiple de 5 | ✅ doc consultée le 2026-10-26 (via recherche) |
| `POST /v2/payment/check` et statuts `ACCEPTED`, `REFUSED`… | ⚠️ **hypothèse** (doc injoignable) |
| Vérification HMAC `x-token` | ❌ non implémentée (formule non confirmée) |
