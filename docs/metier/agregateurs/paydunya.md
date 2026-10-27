# PayDunya

Vérifié le 2026-10-26. Éditeur : PAYDUNYA SERVICES INTERNATIONAL SAS (Sénégal).

## Capacités

| Capacité | Statut | Détail | Source |
|---|---|---|---|
| Dépôt, checkout hébergé | ✅ | API PAR (facture → URL de paiement) | [intro](https://developers.paydunya.com/doc/EN/introduction) |
| Dépôt direct | ✅ | SOFTPAY (Orange Money, Free Money, Expresso, Wave, Wizall au Sénégal ; autres pays à lister) | [SOFTPAY](https://developers.paydunya.com/doc/EN/softpay) |
| Vérification | ✅ | Endpoint de statut paiement / déboursement | intro |
| Retrait | ✅ | API PUSH (déboursement) avec callback de statut | [PUSH](https://developers.paydunya.com/doc/EN/api_deboursement) |
| Remboursement | ❌ probable | Pas d'API publique trouvée (source secondaire, mai 2026) | à confirmer |
| Sandbox | ✅ | Mode test avec clients fictifs configurables (nom, e-mail, solde) | intro |
| Opérateurs | Orange Money, Wave, Free Money, Expresso, Wizall, MTN, Moov, T-Money, Djamo + cartes | SN, BJ, CI, TG, ML, BF, CM (déduit des opérateurs) | intro |

## IPN (webhook)
- POST `application/x-www-form-urlencoded` vers l'URL de callback ; données sous le nœud `data`.
- Vérification officielle : **SHA-512 de la master key** comparé au `hash` reçu. Un tutoriel tiers parle de SHA-512(master key + token) → tester en sandbox.
- ⚠️ Si le hash ne dépend que de la master key, il est **identique pour tous les IPN** : quiconque en voit un peut en forger. → Règle R-003 : ne jamais faire confiance à l'IPN, toujours re-vérifier par l'API de statut.
- Sources : [NodeJS](https://developers.paydunya.com/doc/EN/NodeJS), [Ruby](https://developers.paydunya.com/doc/EN/Ruby)

## CGU
Source : [CGU](https://paydunya.com/terms-of-service) (pas de date ; frais cités 2022).
- Aucune clause sur les clés API, sur les intégrateurs tiers ni sur l'exclusivité.
- Art. 1.5 : le compte n'est pas cessible ; Art. 2.2 : un seul compte par titulaire.
- Art. 4.1 : suspension ou suppression possible **sans préavis**.
- **Conséquence :** le plus compatible des quatre, mais le silence n'est pas une autorisation. Demander une confirmation écrite.
