# Mémoire métier de Pont

Tenue par l'agent `metier`. Source de vérité pour toute règle métier.

- [regles.md](regles.md) : règles numérotées R-xxx
- [agregateurs/](agregateurs/) : fiches vérifiées ([FedaPay](agregateurs/fedapay.md), [Kkiapay](agregateurs/kkiapay.md), [PayDunya](agregateurs/paydunya.md), [CinetPay](agregateurs/cinetpay.md), [PawaPay](agregateurs/pawapay.md))
- [decisions/](decisions/) : [ADR-002 — Registre pour fintechs](decisions/ADR-002-registre-fintech.md) · [ADR-003 — Framework des fintechs](decisions/ADR-003-framework-fintech.md)
- À créer : `glossaire.md`, `cycle-de-vie.md`, `couverture.md`

## Synthèse de la tâche 0 (2026-10-26)

| | FedaPay | PayDunya | CinetPay | Kkiapay | PawaPay |
|---|---|---|---|---|---|
| Dépôt checkout | ✅ | ✅ | ✅ | ⚠️ widget front | ✅ |
| Dépôt direct | ✅ | ✅ SOFTPAY | à vérifier | ❌ serveur | ✅ |
| Vérification | ✅ | ✅ | ✅ | ✅ | ✅ |
| Retrait | ✅ | ✅ | ✅ | à vérifier | ✅ (+ bulk) |
| Remboursement API | ❌ | ❌ probable | à vérifier | ✅ MoMo | ✅ |
| Idempotence native | ❌ | à vérifier | `transaction_id` unique | à vérifier | ✅ UUID |
| Signature webhook | en-tête signé + timestamp | SHA-512 master key (faible) | `x-token` HMAC | signature | RFC 9421 (optionnelle) |
| Cartes bancaires | ✅ | ✅ | ✅ | ✅ | ❌ |
| Clés confiées à un tiers (CGU) | ❌ sans accord | silence | non lu | ❌ | CGU non publiques |
| Multi-agrégateurs (CGU) | ✅ | silence | non lu | ❌ | CGU non publiques |
| Risque opérationnel | — | — | cyberattaque 2025 | — | — |
