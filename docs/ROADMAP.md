# Feuille de route

Document honnête, établi d'après le code réel du dépôt au 28 octobre 2026. « Pont » est un nom de code ; le nom définitif n'est pas arrêté. Aucune date n'est promise.

## Disponible (fonctionne en sandbox)

| Domaine | État |
|---|---|
| Moteur de paiement (`engine`) : idempotence, routage, vérification obligatoire avant `succeeded`, réconciliation, relais de webhooks sortants | disponible |
| Adaptateurs FedaPay, PawaPay, PayDunya, Kkiapay, CinetPay (dépôts, vérifications, webhooks) | disponible, **non éprouvé avec de vrais comptes agrégateurs** ; CinetPay : documentation injoignable lors de la collecte |
| Retraits (FedaPay, PawaPay, PayDunya), remboursements (PawaPay, Kkiapay) | disponible |
| Sandbox à numéros magiques | disponible |
| SDK TypeScript / Node.js (`@pont-bj/node`), CLI `pont`, serveur MCP en sandbox | disponible, version `0.x` |
| Serveur autonome (API `/v1`, `/admin`, `/hooks`), coffre de clés chiffré, planificateur | disponible |
| Stockage PostgreSQL (Prisma) et Convex | disponible |
| Registre en partie double, portefeuilles, plafonds KYC | disponible (PostgreSQL uniquement) |
| Rôles et permissions (`@pont-bj/auth`), dashboard minimal | disponible |
| Self-host en un `./setup.sh` (Docker) | disponible |

## Bientôt

Les dossiers existent mais sont vides : rien n'est utilisable aujourd'hui.

- SDK **PHP** (`sdks/php`)
- Paquet **Laravel** (`sdks/laravel`)
- Passerelle **WooCommerce** (`plugins/woocommerce`)
- Composants **React** (`packages/react`)
- Première publication des paquets npm (après choix du nom et vérification du scope)

## À l'étude

- **Pont Cloud** (version hébergée et payante) : en conception ; les décisions sont dans `docs/plan/deploiement-cloud-selfhost.md`, rien n'est implémenté. Le self-host reste gratuit.
- Tests avec de vrais agrégateurs en production, puis retour d'expérience public.
- Autres agrégateurs et pays, selon les demandes.
- Validation juridique des conditions d'utilisation (brouillon seulement).

## Comment influencer

Ouvrez une issue « fonctionnalité » sur le dépôt, en décrivant votre cas d'usage. Les contributions suivent `CONTRIBUTING.md`.
