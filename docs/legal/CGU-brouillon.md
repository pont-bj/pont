---
titre: Conditions générales d'utilisation de Pont — BROUILLON
version: 0.1
date: 2026-10-27
statut: brouillon technique, à faire relire et compléter par un juriste (droit UEMOA / BCEAO, protection des données Bénin, Sénégal, Côte d'Ivoire)
---

> ⚠️ Ce texte est une base de travail rédigée à partir de l'architecture réelle de Pont (ADR-001). Il ne constitue pas un avis juridique. Les mentions entre crochets [ ] sont à compléter.

# Conditions générales d'utilisation de Pont

## 1. Objet

Pont est un service logiciel édité par [raison sociale, forme, capital, RCCM, IFU, siège] (« l'Éditeur »). Il permet à une entreprise (« le Client ») d'intégrer, d'orchestrer et de superviser les paiements qu'elle reçoit et émet par l'intermédiaire de prestataires de paiement tiers (« les Agrégateurs »), tels que FedaPay, PawaPay, PayDunya ou Kkiapay.

Pont comprend : des bibliothèques logicielles installées dans l'infrastructure du Client (« le Moteur »), un outil en ligne de commande, un serveur MCP pour assistants de programmation, et un tableau de bord en ligne (« le Dashboard »).

## 2. Nature du service — Pont ne détient pas de fonds

2.1. Pont est un **prestataire technique**. L'Éditeur n'encaisse, ne détient, ne conserve ni ne transfère aucun fonds pour le compte du Client ou de ses clients. Les fonds circulent exclusivement entre les clients du Client, les Agrégateurs et le Client, selon les contrats que le Client a conclus avec chaque Agrégateur.

2.2. L'Éditeur n'est pas partie aux contrats entre le Client et les Agrégateurs. Les frais, délais de reversement, plafonds et litiges relatifs aux paiements relèvent de ces contrats.

## 3. Gestion des clés d'Agrégateur

3.1. **Principe : les clés restent chez le Client.** Les clés d'API, secrets et identifiants fournis par les Agrégateurs (« les Clés ») sont configurés par le Client dans sa propre infrastructure, où s'exécute le Moteur. Dans ce mode, l'Éditeur ne reçoit, ne stocke et n'a jamais accès aux Clés.

3.2. **Opérations depuis le Dashboard.** Lorsque le Client déclenche une opération depuis le Dashboard (remboursement, retrait, renvoi de notification), le Dashboard transmet une instruction signée électroniquement à l'infrastructure du Client. Cette dernière vérifie l'instruction et l'exécute avec ses propres Clés. Le Client définit lui-même les types d'opérations autorisés et les plafonds applicables, et peut refuser toute instruction. Chaque instruction est à usage unique, limitée dans le temps et journalisée.

3.3. **Clés hébergées (option).** L'hébergement de Clés par l'Éditeur n'est proposé que pour les Agrégateurs ayant autorisé cet usage par écrit, et uniquement sur activation expresse du Client. Dans ce cas, l'Éditeur s'engage à :
- chiffrer les Clés (chiffrement par enveloppe, clé maître dans un service de gestion de clés), ne jamais les afficher après leur enregistrement ni les inscrire dans des journaux ;
- en limiter l'accès aux seuls traitements nécessaires à l'exécution des opérations demandées ;
- journaliser chaque utilisation ;
- les supprimer définitivement à la déconnexion de l'Agrégateur ou à la résiliation ;
- notifier le Client sans délai injustifié, et au plus tard dans les [72] heures, de tout incident de sécurité les concernant.

3.4. **Respect des contrats d'Agrégateur.** Le Client demeure seul responsable du respect des conditions de chaque Agrégateur, notamment de celles qui encadrent la communication des Clés à des tiers ou l'utilisation simultanée de plusieurs Agrégateurs. Pont affiche, lors de la connexion d'un Agrégateur, les clauses identifiées comme pertinentes, à titre informatif et sans garantie d'exhaustivité.

## 4. Données traitées

4.1. **Données de paiement.** Le Dashboard reçoit des métadonnées d'opérations : identifiants, montants, devises, pays, opérateur, statuts, références du Client, horodatages, codes d'erreur. Le numéro de téléphone du payeur est conservé sous forme [masquée / chiffrée].

4.2. **Données de compte.** Identité et coordonnées des utilisateurs du Dashboard, journaux de connexion et d'audit.

4.3. **Télémétrie technique** (outil en ligne de commande, serveur MCP) : uniquement si le Client l'active ; aucune donnée de paiement ni aucun secret.

4.4. **Rôles.** Pour les données des clients du Client, le Client est responsable de traitement et l'Éditeur sous-traitant ; un accord de traitement des données est annexé ([annexe]).

4.5. **Conformité.** L'Éditeur se conforme à la loi n° 2017-20 portant Code du numérique en République du Bénin et aux exigences de l'APDP, ainsi qu'aux législations applicables dans les pays où le Client opère [Sénégal : CDP ; Côte d'Ivoire : ARTCI ; à compléter]. [Formalités auprès de l'APDP à préciser.]

4.6. **Durées de conservation.** Journaux techniques détaillés : [30] jours. Métadonnées d'opérations : [durée légale applicable]. Données de compte : durée du contrat + [durée].

4.7. **Localisation.** Hébergement : [prestataires et régions]. Transferts hors UEMOA : [garanties].

## 5. Sécurité

L'Éditeur met en œuvre des mesures adaptées : chiffrement des échanges (HTTPS), signatures des notifications, contrôle d'intégrité des opérations (montant, devise, tentative), journal d'audit, authentification à deux facteurs pour les opérations en production, séparation stricte des environnements de test et de production.

Le Client s'engage à : protéger ses Clés et ses secrets, ne jamais les exposer côté navigateur ni dans un dépôt de code, maintenir son infrastructure à jour, et vérifier sa configuration avec l'outil d'audit fourni avant toute mise en production.

## 6. Responsabilités

6.1. L'Éditeur est tenu d'une obligation de moyens quant à la disponibilité et au bon fonctionnement de Pont.

6.2. L'Éditeur n'est pas responsable : des défaillances, retards ou refus des Agrégateurs et des opérateurs de monnaie électronique ; des décisions des Agrégateurs (suspension de compte, blocage de fonds) ; d'un usage de Pont contraire aux contrats d'Agrégateur ; d'une compromission des Clés conservées dans l'infrastructure du Client.

6.3. [Plafond de responsabilité, exclusions, force majeure : à rédiger par le juriste.]

## 7. Mode test et mode production

Le mode test (« sandbox ») simule des paiements sans mouvement de fonds. Aucune opération réalisée en mode test n'a de valeur financière. Le passage en production requiert [vérifications : stockage persistant, audit de sécurité, authentification à deux facteurs].

## 8. Tarifs

[Plans, prix, facturation, révision des prix.] Pont ne prélève aucune commission sur le montant des paiements.

## 9. Durée, suspension, résiliation

[Durée, résiliation par le Client, suspension en cas d'usage frauduleux ou illicite, sort des données et des Clés hébergées à la résiliation : suppression sous [30] jours, export préalable sur demande.]

## 10. Activités interdites

Le Client s'interdit d'utiliser Pont pour des activités illicites ou interdites par les Agrégateurs (notamment blanchiment, financement du terrorisme, produits contrefaits, jeux d'argent non autorisés).

## 11. Droit applicable et litiges

[Droit applicable (ex. droit béninois / OHADA), juridiction compétente, médiation préalable.]

---

## Points à trancher avec le juriste

1. Qualification de Pont au regard de l'Instruction BCEAO n° 001-01-2024 : confirmer l'absence d'agrément requis pour un prestataire purement technique qui ne détient pas de fonds.
2. Formalités APDP (déclaration ou autorisation) et accord de sous-traitance des données.
3. Validité et opposabilité de l'information sur les clauses d'Agrégateur (art. 3.4).
4. Plafond de responsabilité et assurance RC professionnelle.
5. Régime des instructions signées (art. 3.2) : valeur probante du journal d'audit.
