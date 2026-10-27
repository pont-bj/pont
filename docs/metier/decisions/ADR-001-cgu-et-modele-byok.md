# ADR-001 — Où vivent les clés d'agrégateur

- Date : 2026-10-26 (proposé) · 2026-10-27 (**accepté**, choix délégué par François : « la plus pertinente »)
- Statut : **accepté**

## Constat

Conditions d'utilisation lues le 2026-10-26 :

| Agrégateur | Clés confiées à un tiers | Plusieurs agrégateurs chez le marchand |
|---|---|---|
| FedaPay | ❌ interdit sans accord écrit (Art. 6, 1.6 ; sanction : suspension + blocage des fonds) | ✅ permis |
| Kkiapay | ❌ interdit (Art. 11) | ❌ interdit (Art. 18) |
| PayDunya | silence | silence |
| CinetPay | non lues | non lues |
| PawaPay | non publiques | non publiques |

Nos propres conditions d'utilisation lient Pont et le marchand, pas le marchand et l'agrégateur : elles ne peuvent pas lever ces interdictions.

## Décision : hybride, clés chez le marchand par défaut

**1. Par défaut — moteur chez le marchand (« BYOK local »).**
Le moteur (`@pont/node`) tourne dans le backend du marchand ; les clés restent dans ses variables d'environnement. Le cloud Pont ne reçoit que des métadonnées sans secret (statuts, montants, références, numéros masqués).

**2. Dashboard sans clés — instructions signées.**
Les opérations lancées depuis le dashboard (remboursement, retrait, renvoi de webhook) ne sont pas exécutées par Pont : Pont envoie une **instruction signée** au backend du marchand, qui la vérifie (signature, horodatage, nonce anti-rejeu, périmètre autorisé, plafond), l'exécute avec ses propres clés et renvoie le résultat. Le marchand garde le confort du dashboard ; Pont ne touche jamais une clé.

**3. Clés hébergées chez Pont — exception encadrée.**
Uniquement pour un agrégateur qui l'autorise **par écrit** (accord de partenariat), et uniquement si le marchand l'active explicitement. Chiffrement enveloppe (KMS), accès minimal, journal d'audit, suppression à la déconnexion.

## Pourquoi

- Seule option conforme aux CGU de tous les agrégateurs dès aujourd'hui.
- Une fuite chez Pont n'exposerait aucune clé : surface d'attaque minimale.
- Le DX ne change pas : `npx pont init` écrit les clés dans le `.env` du marchand.
- Le mode hébergé reste possible agrégateur par agrégateur, au rythme des partenariats.

## Conséquences

- R-010 : Pont ne stocke aucune clé d'agrégateur sans accord écrit de l'agrégateur concerné.
- R-011 : marchand avec Kkiapay → aucun autre agrégateur (refusé au démarrage du moteur).
- R-012 : chaque connexion d'agrégateur affiche au marchand les clauses CGU qui le concernent.
- R-020 : toute instruction du dashboard est signée, horodatée (± 5 min), à usage unique, limitée à un périmètre et à un plafond fixés par le marchand ; le backend du marchand peut refuser.
- CinetPay hors MVP (désactivé par défaut) tant que ses CGU ne sont pas lues et sa situation post-cyberattaque clarifiée.
- Demandes de partenariat à lancer : FedaPay, PayDunya, PawaPay, Kkiapay (T-004).
- Conditions d'utilisation Pont : brouillon dans `docs/legal/CGU-brouillon.md`, à faire valider par un juriste (BCEAO, APDP).
