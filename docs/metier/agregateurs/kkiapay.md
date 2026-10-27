# Kkiapay

Vérifié le 2026-10-26. Éditeur : OPEN SI SAS (Bénin).

## Capacités

| Capacité | Statut | Détail | Source |
|---|---|---|---|
| Dépôt | ⚠️ widget front | Paiement initié par le client via le widget/SDK front ; initiation par le marchand possible depuis le dashboard seulement (MTN, Flooz). Pas d'initiation serveur documentée. | [transactions](https://docs.kkiapay.me/v1/en-1.0.0/paiements/transactions.md) |
| Vérification | ✅ | SDK admin `k.verify(transactionId)` → `status`, `amount`, `fees`, `failureCode`… | [SDK Node](https://docs.kkiapay.me/v1/en-1.0.0/plugin-et-sdk/admin-sdks-server-side/node.js-admin-sdk.md) |
| Remboursement | ✅ partiel | `k.refund(transactionId)` ; mobile money réussi uniquement ; frais non rendus | idem |
| Retrait | ⚠️ à vérifier | Page « remboursements/payouts » ambiguë | [index](https://docs.kkiapay.me/llms.txt) |
| Sandbox | ✅ | `sandbox: true` dans le SDK | [guide sandbox](https://docs.kkiapay.me/v1/en-1.0.0/compte/kkiapay-sandbox-guide-de-test) |
| Auth | Clés public + private + secret | | SDK |
| Moyens | MTN MoMo, Moov Money (Bénin), cartes | Pays : Bénin principalement (CGU Art. 8) | CGU |

## Webhooks
- Endpoint configuré dans le dashboard, événements au choix, signature vérifiable (détails à extraire de la page webhook). Source : [webhook](https://docs.kkiapay.me/v1/en-1.0.0/tableau-de-bord/webhook)

## CGU — points bloquants
Source : [CGU](https://kkiapay.me/conditions-generales-dutilisation-2/?lang=en) (pas de date ; « © 2024 »).
- **Art. 18** : le membre **ne peut pas utiliser plusieurs solutions d'agrégation de paiement simultanément sur sa plateforme**. → Kkiapay + un autre agrégateur chez le même marchand viole les CGU. Le failover multi-agrégateurs est **interdit** pour un marchand Kkiapay.
- **Art. 11** : les identifiants ne doivent en aucun cas être communiqués à un tiers ; le membre est seul responsable de l'usage par un tiers.
- **Art. 13** : interdiction de modifier / reconfigurer / reproduire le logiciel.
- **Art. 18** : contrat *intuitu personae*, non cessible.
- **Conséquence :** Kkiapay n'est compatible ni avec le BYOK hébergé, ni avec le multi-agrégateurs, sans accord écrit. Voir [ADR-001](../decisions/ADR-001-cgu-et-modele-byok.md).
