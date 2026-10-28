# Clés des agrégateurs et webhooks depuis le dashboard

Deux pages du dashboard : **Clés** (`cles.lire` / `cles.gerer`) et **Webhooks** (`webhooks.lire` / `webhooks.gerer`).

## Le coffre

Les clés saisies dans le dashboard sont chiffrées par le serveur Pont avant d'être écrites en base (AES-256-GCM, un IV aléatoire par valeur). La base ne contient jamais de clair.

- **Clé maître** : `PONT_ENCRYPTION_KEY`, 64 caractères hexadécimaux. `setup.sh` la génère dans `.env`. Elle ne va jamais en base.
- **Perdre la clé maître = perdre les clés stockées** : il faudra les ressaisir. Sauvegardez `.env` à part de la base.
- Changer la clé maître sans migration rend les valeurs illisibles : Pont l'indique (`Impossible de déchiffrer…`) au lieu de planter silencieusement.
- Une valeur recopiée sous une autre clé de stockage ne se déchiffre pas (la clé de stockage est une donnée authentifiée).
- Sans `PONT_ENCRYPTION_KEY`, le coffre est désactivé : les clés restent en variables d'environnement, les pages sont en lecture seule et l'API répond `409 vault_disabled` aux écritures.

Stockage : PostgreSQL (table `pont_secrets`), Convex (table `pontSecrets`), mémoire (tests). Un stockage personnalisé fournit `secrets?: SecretStore` (voir [adaptateurs de stockage](adaptateurs-stockage.md)).

## Clés des agrégateurs

| Agrégateur | Champs |
|---|---|
| FedaPay | clé secrète, secret de webhook |
| PawaPay | jeton d'API, clés publiques de callback (JSON, optionnel) |
| PayDunya | clé maître, clé privée, jeton, nom de la boutique |
| Kkiapay | clé publique, clé privée, clé secrète, secret de webhook |

- **Un secret enregistré ne s'affiche plus en entier** : seul un masque (`••••1234`) revient. Un champ laissé vide garde sa valeur.
- Le coffre l'emporte sur les variables d'environnement ; la page indique la source (`coffre` ou `variables d'environnement`).
- **Validation avant écriture** : champs requis, JSON PawaPay, règle Kkiapay (CGU Art. 18 : pas d'autre agrégateur en même temps). Une combinaison refusée renvoie `422` et rien n'est écrit.
- **Prise en compte immédiate** : le moteur est reconstruit sans redémarrage.
- Sans aucun agrégateur (et sans sandbox), le serveur démarre avec le coffre vide : l'API répond `503 no_provider_available` et le dashboard renvoie vers la page Clés.
- En sandbox (`PONT_SANDBOX=true`), les clés du coffre sont enregistrées mais n'est contacté aucun agrégateur.
- Chaque page affiche l'URL de webhook à déclarer chez l'agrégateur (`<PONT_PUBLIC_URL>/hooks/<agrégateur>`).

## Destinataires de webhooks sortants

Ajoutez autant d'adresses que nécessaire : chacune reçoit chaque événement, signé avec **son propre secret** (`whsec_…`).

- Le secret est généré par le serveur et **affiché une seule fois** à la création.
- Les adresses internes (localhost, réseaux privés) sont refusées en mode `live`.
- `PONT_WEBHOOK_URL` reste pris en compte (destinataire `app`, non modifiable depuis le dashboard).
- La page liste les 50 dernières livraisons : événement, état (en attente, livré, échec), nombre de tentatives, dernière erreur, et un bouton **Renvoyer**.

## API admin

| Route | Rôle |
|---|---|
| `GET /admin/providers` | État de chaque agrégateur, source, secrets masqués, URL de webhook |
| `PUT /admin/providers/<id>` | Enregistre (fusionne) les champs envoyés : `{ "secretKey": "…" }` |
| `DELETE /admin/providers/<id>` | Retire les clés du coffre |
| `GET /admin/webhooks` | URL entrantes, destinataires, dernières livraisons |
| `POST /admin/webhooks/endpoints` | `{ "url": "https://…" }` → `{ id, url, secret }` (secret montré une fois) |
| `DELETE /admin/webhooks/endpoints/<id>` | Retire un destinataire |
| `POST /admin/webhooks/deliveries/<id>` | Renvoie une livraison |

Jeton admin requis (`Authorization: Bearer <PONT_ADMIN_TOKEN>`).

## Pont Cloud

Le coffre du self-host utilise une seule clé maître. Sur Pont Cloud, le chiffrement par enveloppe (clé de données par client, journal d'audit) reste à construire : voir [le plan](../plan/deploiement-cloud-selfhost.md).
