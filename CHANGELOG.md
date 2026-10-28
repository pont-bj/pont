# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versionnage sémantique, avec la réserve habituelle : en `0.x`, l'API peut changer à chaque version mineure.

## [Non publié]

### Ajouté
- Préparation de la publication npm : métadonnées, `README.md` par paquet, workflow `release.yml` (provenance), scripts `scripts/apply-publish-meta.mjs` et `scripts/rename-scope.mjs`.
- Page de politique de confidentialité de la landing (`/confidentialite`).
- `docs/ROADMAP.md`, documents de mise en ligne dans `docs/open-source/`.

### Modifié
- Licence : BUSL-1.1 (remplace `UNLICENSED`).
- Coordonnées de contact et propriétaire du dépôt renseignés (provisoire).
- Retrait des références à des notes personnelles dans `CLAUDE.md` et le cahier des charges.

## [0.1.0] - à venir

Première version prévue des paquets (`@pont-bj/*`), non publiée à ce jour : moteur, cinq adaptateurs (FedaPay, PawaPay, PayDunya, Kkiapay, CinetPay), sandbox, SDK Node, CLI, serveur MCP, serveur autonome, registre et portefeuilles, stockages PostgreSQL et Convex, rôles, dashboard minimal, self-host Docker.
