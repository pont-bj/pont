# Pont

Le backend de ta fintech en un clic. Orchestrateur de paiement **BYOK** (vos clés restent chez vous) et framework fintech pour l'Afrique francophone : FedaPay, PawaPay, PayDunya, Kkiapay.

- **Self-host gratuit à vie** : serveur, dashboard et stockage (PostgreSQL par défaut, Convex en option) en un `./setup.sh`. Voir [`docs/self-host/`](docs/self-host/README.md).
- **Pont Cloud** (payant, à venir) : la même chose, hébergée et gérée.

```bash
cd deploy/self-host && ./setup.sh
```

## Documentation

| Document | Contenu |
|---|---|
| [`docs/self-host/README.md`](docs/self-host/README.md) | Installation, configuration, passage en réel, sécurité, exploitation |
| [`docs/self-host/api.md`](docs/self-host/api.md) | Référence de l'API et des webhooks |
| [`docs/self-host/roles-et-authentification.md`](docs/self-host/roles-et-authentification.md) | Rôles et permissions de votre fintech, authentification, vérification depuis votre application |
| [`docs/self-host/portefeuille-et-registre.md`](docs/self-host/portefeuille-et-registre.md) | Portefeuilles, dépôts, retraits, transferts, plafonds KYC, registre en partie double |
| [`docs/self-host/adaptateurs-stockage.md`](docs/self-host/adaptateurs-stockage.md) | Brancher sa base de données, écrire un adaptateur |
| [`docs/plan/deploiement-cloud-selfhost.md`](docs/plan/deploiement-cloud-selfhost.md) | Décisions : self-host, Cloud, clés, rôles |
| [`docs/CAHIER-DES-CHARGES.md`](docs/CAHIER-DES-CHARGES.md) | Spécification du MVP |

## Statut

Le moteur, les adaptateurs, le registre, le serveur autonome et le dashboard minimal fonctionnent en sandbox. Aucun vrai agrégateur n'a encore été contacté depuis le self-host. Le nom « pont » est un nom de code.

## Licence

Pont est un projet à **code source disponible** : licence [BUSL 1.1](LICENSE), qui se convertit en **AGPL-3.0** quatre ans après la publication de chaque version (il devient alors open source au sens strict).

- **Gratuit, sans rien me devoir :** utiliser Pont en production, l'héberger pour vos clients, l'intégrer, écrire des plugins et des adaptateurs d'agrégateurs, corriger un bug et l'envoyer.
- **Licence commerciale (15 à 20 % du revenu du produit dérivé) :** modifier le code de Pont pour offrir ou distribuer à des tiers un produit dérivé. Voir [`LICENSE-COMMERCIAL.md`](LICENSE-COMMERCIAL.md).
- Questions courantes : [`docs/licence/FAQ.md`](docs/licence/FAQ.md). Contribuer : [`CONTRIBUTING.md`](CONTRIBUTING.md). Contact : pro@aboudouzinsou.com.

Le nom, le logo et l'identité visuelle ne sont pas couverts par la licence du code : voir [`TRADEMARK.md`](TRADEMARK.md).
