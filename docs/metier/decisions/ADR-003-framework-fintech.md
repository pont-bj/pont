# ADR-003 — Pont, le framework des fintechs africaines (modèle Medusa.js)

- Date : 2026-10-27
- Statut : **accepté** (François, 2026-10-27), avec les choix ci-dessous
- Remplace la portée de l'ADR-002 : le registre devient un module du framework
- Compatible avec l'ADR-001 : le framework tourne chez la fintech, Pont ne détient ni clés ni fonds

## Vision

Medusa.js permet de créer une boutique en ligne en assemblant des modules (produits, panier, commandes, paiement…) et en suivant des recettes (marketplace, abonnements…). **Pont fait la même chose pour la finance** : quand on crée une fintech, on prend Pont, on décrit son produit, et l'on obtient un socle financier solide sans le réécrire. Le reste de l'application (interface, métier spécifique) se branche autour.

Avec un agent IA, le parcours devient : « Je crée une tontine digitale au Bénin, avec cotisations hebdomadaires et versement au bénéficiaire du tour » → l'agent consulte les cas d'usage de Pont, choisit la recette « Tontine », installe les modules nécessaires, génère l'intégration dans le code et lance les tests en sandbox.

## Les briques (calquées sur Medusa)

| Medusa | Pont | Contenu |
|---|---|---|
| Modules | **Modules** | Unités indépendantes, chacune avec son modèle de données, ses services et ses règles. Installables séparément. |
| Providers | **Fournisseurs** | Implémentations interchangeables derrière un contrat : agrégateurs (FedaPay, PawaPay, PayDunya, Kkiapay…), KYC, SMS, stockage (Convex, Postgres). |
| Workflows | **Workflows** | Enchaînements d'étapes avec compensation : si une étape échoue, les précédentes sont annulées proprement (ex. retrait échoué → fonds débloqués). |
| Recipes | **Cas d'usage** | Assemblages documentés de modules + workflows + configuration + code type, pour un type de fintech. |
| Admin | **Dashboard** | Le dashboard en cours de conception, étendu selon les modules activés. |
| Medusa Cloud | **Pont Cloud** | Hébergement du dashboard, supervision, relais de webhooks, support. |

## Modules envisagés

| Module | Rôle | État |
|---|---|---|
| `payments` | Encaissement multi-agrégateurs, idempotence, failover, réconciliation | ✅ existe (`@pont/engine`) |
| `payouts` | Retraits vers mobile money | ✅ existe |
| `refunds` | Remboursements | ✅ existe |
| `ledger` | Registre en partie double (ADR-002) | à construire |
| `wallets` | Comptes utilisateurs : disponible, bloqué, historique | à construire, s'appuie sur `ledger` |
| `transfers` | Transferts internes entre utilisateurs | à construire |
| `fees` | Grilles de frais configurables | à construire |
| `limits` | Plafonds par palier KYC, journaliers, mensuels ; gel de compte | à construire |
| `customers` | Utilisateurs finaux, paliers KYC, fournisseur KYC branchable | à construire |
| `escrow` | Séquestre : fonds bloqués jusqu'à une condition (livraison, échéance) | à construire |
| `schedules` | Échéanciers : cotisations, remboursements de prêt | à construire |
| `notifications` | Webhooks sortants signés (existe), SMS, e-mail | partiel |

## Cas d'usage (recettes) prioritaires

| Cas d'usage | Modules |
|---|---|
| Portefeuille mobile | customers, wallets, ledger, payments, payouts, fees, limits |
| Tontine / épargne collective | wallets, ledger, schedules, payouts |
| Marketplace avec séquestre | payments, escrow, payouts, fees |
| Microcrédit | customers, limits, payouts, schedules, ledger |
| Cagnotte / collecte | payments, wallets, payouts |
| Paiement de factures | payments, refunds |

Chaque recette = un manifeste (modules, workflows, configuration par défaut, gabarits de code, tests sandbox), lisible par la CLI (`pont add recipe tontine`) et par le MCP (`list_recipes`, `apply_recipe`).

## Pourquoi c'est la bonne direction

- **Valeur bien plus forte** : on ne vend plus « un raccourci d'intégration » mais « le socle financier de votre fintech ». Les fintechs reconstruisent toutes ce socle, souvent sans partie double ni idempotence.
- **Cohérent avec l'ADR-001** : le framework s'exécute dans l'infrastructure de la fintech, avec ses clés et ses comptes. Pont reste un éditeur de logiciel, ni détenteur de fonds ni de clés.
- **Fait pour l'agentique** : des modules aux contrats stricts et des recettes déclaratives sont exactement ce qu'un agent sait assembler sans erreur. Le MCP devient le point d'entrée principal.
- **Le code actuel est réutilisable** : `@pont/engine` devient le module `payments`, les adaptateurs deviennent des fournisseurs, `@pont/store-convex` le premier fournisseur de stockage.

## Risques

- **Périmètre** : un framework est beaucoup plus large qu'un orchestrateur. Il faut livrer par recette, pas par module isolé.
- **Modèle économique** : Medusa est open source et vit de son cloud. Si Pont fait pareil, le « high ticket » se déplace vers Pont Cloud, l'accompagnement et un pack conformité (paliers BCEAO, rapports). À trancher.
- **Conformité** : Pont fournit l'outillage (paliers KYC, plafonds, journaux) ; la conformité reste la responsabilité de la fintech et de son agrément. À dire clairement.

## Proposition de séquence

1. Garder la livraison actuelle (orchestrateur) comme module `payments`, sans casser l'existant.
2. Définir le **contrat de module**, le **moteur de workflows avec compensation** et le **format de recette**.
3. Construire `ledger` + `wallets` + `limits`, puis la première recette complète de bout en bout : **Portefeuille mobile**.
4. Ajouter `apply_recipe` au MCP et `pont add recipe` à la CLI.
5. Recettes suivantes selon la demande : Tontine, Marketplace avec séquestre.

## Choix arrêtés (2026-10-27)

1. **Open core.** Quelques modules en open source, le reste propriétaire.
   - Proposition à valider : open source = `core`, `payments`, fournisseurs d'agrégateurs, CLI, MCP (ce qui fait l'adoption) ; propriétaire = `ledger`, `wallets`, `limits`, `escrow`, `schedules`, recettes avancées, Pont Cloud (ce qui fait la valeur d'une fintech).
2. **Gratuit au démarrage.** Phase early stage : tout est gratuit pour valider la demande ; la tarification vient ensuite (Pont Cloud, modules propriétaires, accompagnement).
3. **Stockage : Convex et Postgres.** Ajout d'un fournisseur `@pont/store-prisma` (Prisma Postgres), conformément à la règle « pas de SQL brut, Prisma uniquement ».
4. **Première recette : Portefeuille mobile** (proposition retenue faute d'avis contraire ; modifiable).

## Questions encore ouvertes

1. Licence des modules open source (MIT, Apache-2.0 ou licence source-available type BSL) ?
2. Liste exacte des modules open source vs propriétaires.
