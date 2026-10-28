# ADR-002 — Pont, infrastructure de paiement des fintechs : le registre

- Date : 2026-10-27
- Statut : **accepté sur le principe**, puis **intégré à l'ADR-003** (2026-10-27) : le registre devient le module `ledger` du framework
- Liens : ADR-001 (clés chez le marchand, non-custodial)

## Contexte

Pont orchestre aujourd'hui des paiements : il fait circuler une opération entre une application et un agrégateur. Une fintech (portefeuille, tontine digitale, marketplace, prêt, transfert) a besoin de davantage : savoir à tout instant ce que possède chacun de ses utilisateurs, ce qui est engagé, ce qu'elle a gagné, et respecter les règles du métier (plafonds KYC, frais, délais). Chaque fintech reconstruit ce socle, souvent mal (soldes stockés dans une colonne, sans historique ni contrôle).

## Décision

Pont devient **l'infrastructure de paiement des fintechs africaines** en ajoutant, au-dessus de l'orchestrateur, un **registre** (module payant, phase 2). L'orchestrateur reste le socle et la porte d'entrée commerciale.

### Le registre

1. **Comptabilité en partie double.** Chaque mouvement est une écriture équilibrée (débit = crédit) entre comptes. Rien n'est jamais modifié ni supprimé : une erreur se corrige par une écriture inverse. Le solde d'un compte est la somme de ses écritures.
2. **Comptes.** Pour chaque utilisateur final de la fintech : un compte « disponible » et un compte « bloqué ». Pour la fintech : comptes de frais, de transit (fonds en cours chez un agrégateur), de pertes et d'ajustements.
3. **Opérations prêtes à l'emploi**, chacune reliée à une opération Pont :
   - dépôt : transit → disponible de l'utilisateur, à la confirmation du paiement (R-001) ;
   - retrait : disponible → bloqué à la demande, bloqué → sortie à la confirmation, retour au disponible en cas d'échec ;
   - transfert interne entre utilisateurs (sans agrégateur) ;
   - frais : prélevés à chaque opération selon une grille configurable ;
   - remboursement, annulation, correction.
4. **Règles configurables** : plafonds par palier de KYC (alignés sur les paliers BCEAO applicables à la fintech), plafonds journaliers et mensuels, délai minimum avant retrait, gel d'un compte, montant minimal.
5. **Idempotence et concurrence** : chaque écriture porte une clé d'idempotence ; deux retraits simultanés ne peuvent jamais rendre un solde négatif.
6. **Réconciliation** : comparaison quotidienne entre le total du registre et les soldes réels de la fintech chez chaque agrégateur ; tout écart est signalé.

## La limite à ne jamais franchir

**Pont tient les comptes, il ne détient jamais l'argent.** Les fonds restent sur les comptes de la fintech chez ses agrégateurs ou sa banque. Le registre est l'outil comptable de la fintech, exécuté pour son compte.

- Si Pont détenait ou faisait circuler les fonds lui-même, il deviendrait émetteur de monnaie électronique ou établissement de paiement : agrément BCEAO obligatoire. Ce n'est pas le cas.
- C'est la fintech qui porte la relation avec ses utilisateurs, son propre agrément (ou celui de son partenaire) et ses obligations KYC/LBC-FT. Pont fournit l'outillage (paliers, plafonds, gel), pas la conformité elle-même.
- À faire valider par le juriste en même temps que les CGU.

## Conséquences

- Nouvelles règles métier à écrire au démarrage du module : R-030 (écriture équilibrée, immuable), R-031 (solde jamais négatif), R-032 (dépôt crédité seulement après vérification agrégateur), R-033 (retrait : fonds bloqués avant l'envoi, restitués en cas d'échec), R-034 (réconciliation registre ↔ soldes agrégateurs).
- Architecture : nouveau paquet `@pont-bj/ledger`, stockage transactionnel (Convex pour commencer : mutations sérialisables ; Postgres envisagé si le volume l'exige).
- Dashboard : nouvelles entrées « Comptes » et « Registre » lorsque le module est activé.
- Positionnement commercial : « l'infrastructure de paiement des fintechs africaines ». L'orchestrateur reste l'offre d'entrée ; le registre se vend à part (plan Scale / Fintech).
- Le MVP actuel ne change pas : le registre démarre après la mise en production de l'orchestrateur.

## Questions ouvertes

1. Multi-devises (XOF, XAF) dans un même registre, conversion interdite ou permise ?
2. Fréquence de réconciliation : quotidienne ou continue ?
3. Export comptable : format attendu par les cabinets (SYSCOHADA) ?
4. Tarification du module.
