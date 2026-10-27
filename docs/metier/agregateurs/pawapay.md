# PawaPay

Vérifié le 2026-10-26 (doc officielle v2). Mobile money uniquement, pas de cartes.

## Capacités

| Capacité | Statut | Détail | Source |
|---|---|---|---|
| Dépôt direct | ✅ | `POST /v2/deposits` ; `depositId` UUID v4 (36 car.) = clé d'idempotence ; `payer.accountDetails.provider` + `phoneNumber` (MSISDN, chiffres seuls, sans `+`) ; `amount` en **chaîne** ; `currency` ISO | [initiate-deposit](https://docs.pawapay.io/v2/api-reference/deposits/initiate-deposit.md) |
| Réponse initiale | | `ACCEPTED` (callback suivra), `REJECTED` (`failureReason`), `DUPLICATE_IGNORED` (même `depositId`) | idem |
| Vérification | ✅ | Check deposit status ; resend callback disponible | [llms.txt](https://docs.pawapay.io/llms.txt) |
| Retrait | ✅ | Payout unitaire + **bulk** ; annulation d'un payout en file | idem |
| Remboursement | ✅ | Initiate refund + statut + annulation en file | idem |
| Page de paiement hébergée | ✅ | Payment page / checkouts | idem |
| Disponibilité opérateurs | ✅ | Endpoint *Provider Availability* (utile pour le routage et la carte de couverture) | idem |
| Idempotence native | ✅ | via `depositId` / `payoutId` / `refundId` | |
| Sandbox | ✅ | `https://api.sandbox.pawapay.io` + numéros de test ; prod `https://api.pawapay.io` | |
| Auth | Bearer token ; 2 tokens actifs max ; non ré-affichable ; sandbox et live séparés ; création réservée au rôle *Technical Administration* | [api tokens](https://docs.pawapay.io/dashboard/other/system_conf/api_tokens) |
| SDK officiel | ❌ | HTTP direct (OpenAPI, Postman) | |

## Signatures (le meilleur des 5)
- Requêtes et callbacks signables selon **RFC 9421** (`Signature`, `Signature-Input`, `Content-Digest`, `Signature-Date`) ; optionnel, activable dans le dashboard (« n'accepter que les requêtes signées »).
- Algorithmes : RSA-PSS SHA-512, RSA PKCS1 v1.5 SHA-256, ECDSA P-256 / P-384.
- Clé publique PawaPay via l'endpoint *Public Keys*.
- Source : [signatures](https://docs.pawapay.io/v2/docs/signatures.md)

## Couverture francophone (opérateur → code)

| Pays | Codes | Auth client |
|---|---|---|
| Bénin | `MTN_MOMO_BEN`, `MOOV_BEN` | PROVIDER_AUTH |
| Burkina Faso | `MOOV_BFA`, `ORANGE_BFA` | Orange : **PREAUTH** (`preAuthorisationCode` requis) |
| Cameroun | `MTN_MOMO_CMR`, `ORANGE_CMR` | PROVIDER_AUTH |
| Côte d'Ivoire | `MTN_MOMO_CIV`, `ORANGE_CIV`, `WAVE_CIV` | Wave : **REDIRECT_AUTH** |
| Sénégal | `FREE_SEN`, `ORANGE_SEN`, `WAVE_SEN` | Wave : REDIRECT_AUTH |
| Congo | `AIRTEL_COG`, `MTN_MOMO_COG` | PROVIDER_AUTH |
| RDC | `VODACOM_MPESA_COD`, `AIRTEL_COD`, `ORANGE_COD` (CDF et USD) | PROVIDER_AUTH |
| Gabon | `AIRTEL_GAB` | PROVIDER_AUTH |
| Mali | non listé sur la page providers (page markets : modèle orchestration) | |
| Togo, Niger | ❌ | |

Source : [providers](https://docs.pawapay.io/v2/docs/providers.md). Pas de décimales en XOF/XAF (la page indique « 2 places » pour `AIRTEL_GAB` en XAF : à vérifier).

→ Trois modes d'autorisation à gérer dans `NextAction` : push sur le téléphone (PROVIDER_AUTH), code saisi avant (PREAUTH), redirection (REDIRECT_AUTH).

## CGU
- **Non trouvées publiquement** (contrat marchand probable, signé à l'onboarding). À demander à PawaPay, avec la même grille : clés confiées à un tiers ? multi-agrégateurs ?
- Point favorable : PawaPay propose lui-même un « modèle orchestration » (le marchand détient ses comptes chez les opérateurs) et vise les plateformes ; un partenariat technique est plausible.

## Restant à vérifier
Tests sandbox : numéros de test, statuts finaux et `failureReason`, montants min/max par opérateur, flux REDIRECT_AUTH (Wave), PREAUTH (Orange BF).
