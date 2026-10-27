# CinetPay

Vérifié le 2026-10-26. Éditeur : CINETPAY SAS et filiales (Côte d'Ivoire).

## Capacités

| Capacité | Statut | Détail | Source |
|---|---|---|---|
| Dépôt, checkout | ✅ | `POST https://api-checkout.cinetpay.com/v2/payment` ; `apikey`, `site_id`, `transaction_id` unique, `amount` **multiple de 5**, `currency`, `notify_url`, `return_url` | [initialisation](https://docs.cinetpay.com/api/1.0-en/checkout/initialisation) |
| Vérification | ✅ | Section « Transaction Verification » (contenu non récupéré) | doc |
| Retrait | ✅ | API de transfert, callback avec `transaction_id`, `sending_status`, `treatment_status`… ; re-vérifier par `transaction_id` | doc transfert |
| Remboursement | ⚠️ à vérifier | | |
| Sandbox | ✅ | clés de test | MCP officiel |
| Pays | CI, SN, CM, BF, ML, TG, GN, BJ, CD, NE | | [cinetpay-mcp](https://glama.ai/mcp/servers/cinetpay/cinetpay-mcp) |

## Notification (webhook)
- POST vers `notify_url` (doit aussi accepter GET), réponse 200 attendue.
- En-tête `x-token` : HMAC (détail sur la page X-TOKEN, non récupéré).
- Champs `cpm_site_id`, `cpm_trans_id`, `cpm_amount`… ; toujours re-vérifier par l'API.
- Source : [notification](https://docs.cinetpay.com/api/1.0-en/checkout/notification)
- ⚠️ `docs.cinetpay.com` était injoignable (DNS) le 2026-10-26.

## Risque opérationnel majeur
- **Cyberattaque en septembre 2025** (CI, Togo, Burkina) via les interfaces de trésorerie inter-pays ; retards de reversement aux marchands dès août 2025 ; litige avec D-Pay (~655 M FCFA) ; enquête au Sénégal.
- Mars 2026, le PDG affirme une reprise normale et l'indemnisation de la majorité des marchands ; d'autres sources parlent de fonds encore bloqués. Rien de publié après mars 2026.
- Sources : [TechCabal](https://techcabal.com/2026/02/01/cinetpay-cyberattack/), [Financial Afrik](https://www.financialafrik.com/2026/03/25/entretien-exclusif-avec-daniel-dindji-directeur-general-de-cinetpay/), [Burkina24](https://burkina24.com/2026/03/29/cinetpay-six-mois-apres-la-cyberattaque-le-pdg-daniel-dindji-fait-le-point/)

## CGU
- [CGU services](https://cinetpay.com/legal/cgu-services) : **non lues** (403 au téléchargement). À lire manuellement.
