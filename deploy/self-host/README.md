# Pont en self-host

Gratuit à vie. Un serveur Pont, son dashboard et une base PostgreSQL, sur votre machine ou votre serveur.

## Installation

```bash
cd deploy/self-host
./setup.sh
```

Prérequis : Docker et openssl. Le script génère les secrets dans `.env` (jamais affichés), démarre PostgreSQL, y crée les tables Pont puis lance tous les services. Il peut être relancé sans risque.

| Service | Adresse | Rôle |
|---|---|---|
| Dashboard Pont | http://localhost:3300 | Le premier visiteur crée le compte administrateur (une seule inscription possible) |
| API Pont | http://localhost:8787 | Votre application appelle `/v1/*` ; les agrégateurs appellent `/hooks/<agrégateur>` |
| Dashboard Convex | http://localhost:6791 | Seulement avec `./setup.sh --store convex` (clé : `CONVEX_SELF_HOSTED_ADMIN_KEY` dans `.env`) |

## Utiliser l'API

Authentification : `Authorization: Bearer <PONT_API_KEY>` (dans `.env`).

```bash
curl -X POST http://localhost:8787/v1/payments \
  -H "authorization: Bearer $PONT_API_KEY" \
  -d '{"amount":5000,"currency":"XOF","country":"BJ","customer":{"phone":"+2290100000001"},"reference":"commande-42"}'
```

**Idempotence.** Envoyer deux fois la même `reference` renvoie le même paiement, sans double débit : Pont déduit la clé d'idempotence de la référence. Pour la maîtriser, ajoutez l'en-tête `Idempotency-Key`. Une même référence avec un contenu différent renvoie `409`. Pour retenter un paiement échoué, utilisez une nouvelle référence (`commande-42-2`) ou une autre `Idempotency-Key`.

## Sandbox

`PONT_SANDBOX=true` (par défaut) : aucun agrégateur n'est contacté. Les 7 derniers chiffres du numéro choisissent le scénario (`0000001` succès, `0000002` solde insuffisant, `0000003` jamais confirmé, `0000008` refusé). Le dashboard propose un bouton « Lancer un paiement de test ».

## Passer en réel

1. Renseignez les clés de vos agrégateurs dans `.env` (elles restent sur votre serveur).
2. `PONT_MODE=live` et `PONT_SANDBOX=false`.
3. Placez le serveur derrière HTTPS et renseignez `PONT_PUBLIC_URL` et `DASHBOARD_URL`.
4. `docker compose up -d`.

Le mode live refuse de démarrer sans stockage durable (PostgreSQL ou Convex).
