# Pont en self-host

Pont est un orchestrateur de paiement **BYOK** pour l'Afrique francophone : vos clés d'agrégateurs (FedaPay, PawaPay, PayDunya, Kkiapay) restent sur votre serveur, Pont unifie l'API, les webhooks, le sandbox et la sécurité. Le self-host est **gratuit à vie**.

## Ce que vous installez

```
 Votre application ──(clé API)──▶  Serveur Pont  ──▶ Agrégateurs (FedaPay, PawaPay…)
                                    │   ▲                    │
              Dashboard Pont ─(jeton admin)─┘                │
              (connexion Better Auth)                        ▼
                                    │              Webhooks signés ─▶ /hooks/<agrégateur>
                                    ▼
                          Stockage : PostgreSQL | Convex | votre adaptateur
```

| Service | Port | Rôle |
|---|---|---|
| `pont` | 8787 | API `/v1`, API du dashboard `/admin`, réception des webhooks `/hooks`, planificateur |
| `dashboard` | 3300 | Interface web : aperçu, paiements, portefeuilles, registre, utilisateurs, rôles ; sert aussi l'authentification (`/api/auth`) |
| `backend` + `convex-dashboard` | 3210, 6791 | Convex self-hosted (si `PONT_STORE=convex`) |
| `postgres` | interne | PostgreSQL fourni (si `PONT_STORE=postgres` sans `DATABASE_URL`) |

## Installation

Prérequis : Docker, openssl.

```bash
cd deploy/self-host
./setup.sh                    # stockage PostgreSQL (défaut : paiements, portefeuilles et registre)
./setup.sh --store convex     # stockage Convex (paiements seulement, pas de portefeuille ni de registre)
```

Le script :
1. crée `.env` et y génère tous les secrets (jamais affichés) ;
2. démarre le stockage choisi et y crée les tables Pont ;
3. démarre le serveur et le dashboard.

Relançable sans risque : un secret existant n'est jamais écrasé. Ouvrez ensuite http://localhost:3300 : **le premier visiteur crée le compte administrateur**, ensuite les inscriptions sont fermées.

## Choisir son stockage

| `PONT_STORE` | Pour qui | Détail |
|---|---|---|
| `postgres` + `DATABASE_URL` vide (défaut) | Tout dans Docker, portefeuilles et registre inclus | Conteneur PostgreSQL fourni, volume `postgres-data` |
| `convex` | Paiements seulement, aucune base à gérer | Convex self-hosted, installé avec Pont. Pas de portefeuille ni de registre |
| `postgres` + `DATABASE_URL=…` | **Brancher votre propre base** (Neon, Supabase, RDS, serveur interne) | Aucun conteneur de base n'est lancé |
| adaptateur maison | MySQL, MongoDB, DynamoDB… | Voir [adaptateurs de stockage](adaptateurs-stockage.md) |
| `memory` | Tests locaux uniquement | Les données disparaissent à l'arrêt. **Interdit en live.** |

Les comptes du dashboard sont à part : un fichier SQLite (volume `dashboard-data`), géré par Better Auth.

## Configuration (`deploy/self-host/.env`)

| Variable | Rôle |
|---|---|
| `PONT_MODE` | `test` (défaut) ou `live` |
| `PONT_SANDBOX` | `true` : aucun agrégateur n'est contacté (numéros magiques). Interdit en live |
| `PONT_STORE`, `DATABASE_URL` | Stockage (voir ci-dessus) |
| `PONT_PUBLIC_URL`, `DASHBOARD_URL` | URL publiques (HTTPS en production) |
| `PONT_PORT`, `DASHBOARD_PORT` | Ports exposés (8787, 3300) |
| `PONT_API_KEY` | Clé que **votre application** présente à `/v1` (générée) |
| `PONT_ADMIN_TOKEN` | Jeton du dashboard pour `/admin` (généré) |
| `PONT_WALLET_CURRENCY`, `PONT_LIMITS`, `PONT_WITHDRAWAL_FEE_BPS` | Portefeuille : devise, plafonds par palier KYC, frais de retrait (voir [portefeuille et registre](portefeuille-et-registre.md)) |
| `PONT_ROLES_PRESET` | Modèle de rôles : `portefeuille`, `tontine`, `marketplace` |
| `PONT_SIGNUP_ROLE` | Rôle des inscrits publics (vide : inscription fermée) |
| `PONT_TRUSTED_ORIGINS` | URL de votre application autorisées à appeler l'authentification |
| `PONT_PLUGINS_DIR` | Dossier des agrégateurs personnalisés (un sous-dossier par agrégateur, généré par `pont provider new`). Déjà branché sur `deploy/self-host/plugins` dans Docker. Exécute le code de ces dossiers : voir [intégration d'agrégateur](integration-agregateur.md) |
| `PONT_ENCRYPTION_KEY` | Clé maître du coffre (générée) : chiffre les clés d'agrégateurs saisies dans le dashboard. La perdre oblige à les ressaisir. Voir [clés et webhooks](cles-et-webhooks.md) |
| `PONT_WEBHOOK_URL`, `PONT_WEBHOOK_SECRET` | Où Pont envoie les événements (paiement réussi…), signés |
| `FEDAPAY_*`, `PAWAPAY_*`, `PAYDUNYA_*`, `KKIAPAY_*` | Clés des agrégateurs : un agrégateur est activé dès que ses variables sont présentes |

## Premier paiement

```bash
TOKEN=$(grep '^PONT_ADMIN_TOKEN=' .env | cut -d= -f2 | tr -d '"')
curl -s -X POST localhost:8787/admin/test-payment -H "authorization: Bearer $TOKEN" -d '{}'
```

Ou le bouton « Lancer un paiement de test » du dashboard. En sandbox, les 7 derniers chiffres du numéro choisissent le scénario : `0000001` succès, `0000002` solde insuffisant, `0000003` jamais confirmé, `0000004` succès avec webhook en double, `0000005` succès avec webhook tardif, `0000006` agrégateur en panne, `0000007` délai ambigu, `0000008` refusé par le client.

## Passer en réel

1. Renseignez les clés de vos agrégateurs dans `.env`.
2. `PONT_MODE=live`, `PONT_SANDBOX=false`.
3. Mettez le serveur et le dashboard derrière HTTPS avec `./setup.sh --prod` (proxy Caddy, domaines, services internes non exposés) : voir [mise en production](mise-en-production.md).
4. Déclarez l'URL `https://<votre-domaine>/hooks/<agrégateur>` dans la console de chaque agrégateur.
5. `docker compose up -d`.

Le serveur refuse de démarrer en live avec un stockage non durable ou avec le sandbox actif.

## Sécurité

- Un paiement ne passe à `succeeded` qu'après vérification auprès de l'agrégateur.
- Un statut incertain (`ambiguous`) déclenche une vérification, jamais un nouvel essai chez un autre agrégateur.
- La clé API et le jeton admin sont distincts : l'un ne donne jamais accès aux routes de l'autre.
- Les webhooks entrants sont rejetés (401) si leur signature est invalide ; les événements sortants sont signés (`Pont-Signature`).
- Aucun secret dans les logs ni dans les réponses d'erreur.
- Dashboard : accès par rôle (voir [rôles et authentification](roles-et-authentification.md)), mot de passe de 12 caractères minimum, cookies de session gérés par Better Auth, inscription publique fermée par défaut.

## Exploitation

```bash
docker compose ps                  # état des services
docker compose logs -f pont        # journaux du serveur
docker compose pull && docker compose up -d --build   # mise à jour
```

Sauvegardes : volume `convex-data` ou `postgres-data` (ou votre base) pour les paiements, volume `dashboard-data` pour les comptes. Les tables Pont se créent avec `prisma db push` (Postgres) ou `convex deploy` (Convex) au `setup.sh` ; il n'y a pas encore de migrations versionnées.

## Limites actuelles

- Testé en sandbox uniquement : aucun vrai agrégateur n'a encore été contacté depuis le self-host.
- Le dashboard gère l'aperçu, les paiements, les portefeuilles et le registre (PostgreSQL uniquement), les utilisateurs et les rôles, les clés des agrégateurs (coffre chiffré), les webhooks ([détail](cles-et-webhooks.md)), l'e-mail SMTP et les alertes ([détail](email-et-alertes.md)). Pas encore : intégration d'agrégateur personnalisé, 2FA ; voir `docs/plan/deploiement-cloud-selfhost.md`.
- Les clés saisies dans le dashboard n'ont été testées qu'avec des valeurs factices en sandbox.
