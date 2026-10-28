# Politique de sécurité

## Signaler une vulnérabilité

**N'ouvre jamais d'issue publique, de PR ou de discussion publique pour une faille de sécurité.**

Écris en privé à `pro@aboudouzinsou.com` (ou via le signalement privé de vulnérabilité de GitHub, une fois activé sur le dépôt) en indiquant :

- la description et l'impact potentiel ;
- les étapes de reproduction, ou une preuve de concept minimale ;
- la version ou le commit concerné ;
- ton nom ou pseudonyme si tu souhaites être cité.

Ne joins jamais de vraies clés, de vrais jetons ni de données personnelles réelles.

## Délais

| Étape | Objectif |
|---|---|
| Accusé de réception | 3 jours ouvrés |
| Première évaluation (recevable, gravité) | 7 jours |
| Correctif ou plan de correction pour les failles critiques et hautes | 30 jours |
| Divulgation publique coordonnée | après correctif, au plus tard 90 jours après le signalement, sauf accord commun |

Ces délais sont des objectifs de bonne foi pour un projet maintenu par peu de personnes.

## Versions couvertes

Le projet est en développement précoce (version `0.x`). Seuls la branche `main` et la dernière version publiée reçoivent des correctifs de sécurité.

## Périmètre

Dans le périmètre : le code de ce dépôt, notamment le serveur, le coffre de clés chiffré, la vérification des webhooks, l'authentification et les rôles, le registre, les SDK, le dashboard et les scripts de déploiement self-host.

Principes du projet utiles à l'évaluation :

- Le code ne détient jamais de fonds : Pont est non-custodial. Une faille s'évalue donc surtout en fuite de secrets, contournement d'authentification, falsification d'un statut de paiement, ou corruption du registre.
- Les clés des agrégateurs (BYOK) et les secrets sont chiffrés au repos et ne doivent apparaître ni dans les logs ni dans les réponses : toute fuite est une faille.

Hors périmètre : les vulnérabilités des agrégateurs eux-mêmes (à signaler à ces derniers), les attaques nécessitant un accès déjà privilégié à la machine hôte, le déni de service par volume brut, l'ingénierie sociale, et les installations self-host mal configurées contre les recommandations de la documentation.

## Règles pour les chercheurs

- Ne teste **jamais sur de vrais agrégateurs** ni avec de vrais comptes ou de vrais fonds : utilise le mode sandbox et ta propre instance locale.
- N'accède pas aux données d'autrui, ne les modifie pas, ne les détruis pas.
- Laisse-nous un délai raisonnable pour corriger avant toute divulgation.

Nous ne poursuivrons pas les personnes qui respectent cette politique de bonne foi.

## Divulgation coordonnée

Nous publions un avis de sécurité (GitHub Security Advisory, avec identifiant CVE si pertinent) une fois le correctif disponible, en créditant la personne qui a signalé la faille si elle le souhaite.
