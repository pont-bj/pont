# FedaPay

Vérifié le 2026-10-26 (doc officielle + CGU). Éditeur : NAUTILUS TECHNOLOGY SARL / FEDAPAY S.A. (deux entités citées selon la page, à clarifier).

## Capacités

| Capacité | Statut | Détail | Source |
|---|---|---|---|
| Dépôt, checkout hébergé | ✅ | `POST /transactions` puis `POST /transactions/{id}/token` (lien de paiement) | [API ref](https://docs.fedapay.com/api-reference/transactions/create-token.md) |
| Dépôt direct (sans redirection) | ✅ | `POST /transactions/{mode}` avec `token` + `phone_number {number, country}` ; modes vus : `mtn`, `moov`, `mtn_ci`, `moov_tg`. Statuts du payment intent : pending, scheduled, sent, failed. Liste complète des modes à établir. | [send-payment](https://docs.fedapay.com/api-reference/transactions/send-payment.md) |
| Vérification | ✅ | `GET /transactions/{id}` | OpenAPI |
| Retrait | ✅ | `POST /payouts` puis `PUT /payouts/start` | OpenAPI |
| Remboursement | ❌ API | Uniquement depuis le dashboard | [index doc](https://docs.fedapay.com/_llms/en.txt) |
| Idempotence native | ❌ | Aucun en-tête d'idempotence dans l'OpenAPI → Pont doit la garantir lui-même | OpenAPI |
| Sandbox | ✅ | `https://sandbox-api.fedapay.com/v1` ; live `https://api.fedapay.com/v1` | OpenAPI |
| Auth | Bearer clé secrète | | OpenAPI |

## Webhooks
- En-tête `X-FEDAPAY-SIGNATURE`, contient signature + timestamp ; algorithme non documenté → utiliser `Webhook.constructEvent` (SDK officiel Node/PHP) ou le reproduire après test.
- Secret propre à chaque endpoint, différent en test et en live.
- Liste d'IP FedaPay publiée (filtrage possible).
- Événements : `transaction.created|updated|approved|declined|canceled|transferred`, `customer.*`. Pas d'événement de remboursement listé.
- Retries : 10 tentatives exponentielles (≤ 2 min d'écart), puis **désactivation automatique de l'endpoint** (option décochable). → Pont doit toujours répondre 2xx vite et traiter en asynchrone.
- Source : [webhooks](https://docs.fedapay.com/en/integration-api/webhooks.md)

## Mapping statuts (provisoire, à valider en sandbox)
| FedaPay | Pont |
|---|---|
| pending | pending |
| approved | succeeded (après `GET`) |
| declined | failed |
| canceled | cancelled |
| transferred | succeeded (fonds reversés au marchand) |

## CGU — points bloquants
Source : [CGU](https://www.fedapay.com/general-terms-of-use) (pas de date de version ; modifiables « à tout moment et sans préavis », Art. 9).
- **Art. 6** : interdit de donner à des tiers l'accès à la plateforme ou **aux clés d'API** sans accord écrit de l'éditeur.
- **Art. 1.6** : la mise à disposition non autorisée des identifiants et clés d'API à un tiers est un manquement grave → suspension immédiate et **blocage des fonds**. Déléguer la gestion du compte est interdit.
- **Art. 6** : interdit d'associer FedaPay à des programmes non autorisés ou non documentés par l'éditeur.
- Pas de clause d'exclusivité : utiliser d'autres agrégateurs est permis.
- **Conséquence : BYOK hébergé chez Pont = interdit sans accord écrit de FedaPay.** Voir ADR-001.
