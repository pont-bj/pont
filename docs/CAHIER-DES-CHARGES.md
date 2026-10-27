---
titre: Cahier des charges — MVP Pont (orchestrateur de paiement Afrique francophone)
version: 0.1
date: 2026-10-26
auteur: François Mawutô Aboudou ZINSOU
statut: brouillon
---

# Cahier des charges — MVP « Pont »

> **Pont** est un nom de code. Renommer avant le lancement public (vérifier npm, Packagist, domaine, INPI/OAPI).
> Recherche marché associée : `~/Brain/projets/20261026-1200-orchestrateur-paiement-afrique-francophone.md`.

---

## 1. Vision

**Le Stripe des agrégateurs africains.** Une seule intégration, faite en une commande ou par un agent IA, pour encaisser et payer via les agrégateurs de paiement que la startup utilise déjà (FedaPay, PayDunya, CinetPay, Kkiapay). Pont ne touche jamais l'argent : il orchestre, sécurise, normalise et observe.

**Promesse mesurable :** *une commande → un paiement test réussi en moins de 5 minutes, sur n'importe quelle stack supportée.*

## 2. Problème

| Douleur du développeur | Ce que Pont apporte |
|---|---|
| Attendre le KYC de l'agrégateur avant de tester | Sandbox Pont utilisable dès l'inscription, sans compte agrégateur |
| Sandbox pauvre ou inexistant | Numéros magiques simulant tous les cas réels (refus, timeout, webhook doublé…) |
| Webhooks difficiles à tester en local | `pont listen` / `pont trigger` / `pont replay` |
| Statuts, formats, signatures différents par agrégateur | Une API, un modèle, un format de webhook signé |
| Peur de livrer une commande non payée | Vérification serveur obligatoire avant `succeeded` |
| Échecs incompréhensibles | Erreurs normalisées, expliquées en français, avec correctif |
| Migration d'agrégateur = réécriture | Changer d'agrégateur = un clic dans le dashboard |
| Couverture floue (qui couvre quoi, où) | Carte de couverture réelle calculée sur les clés connectées |

## 3. Cible et positionnement

- **Cible primaire :** startups et PME tech d'Afrique francophone (UEMOA d'abord) qui intègrent le paiement dans un produit web ou mobile.
- **Cible secondaire :** agences web qui intègrent pour leurs clients (canal de distribution).
- **Hors cible MVP :** marchands sans développeur (couvert plus tard par WooCommerce/Shopify).
- **Modèle (ADR-001, accepté le 2026-10-27) :** non-custodial. Le moteur tourne dans le backend du marchand et **les clés restent chez lui** ; le dashboard pilote les opérations par **instructions signées** exécutées par ce backend ; clés hébergées chez Pont uniquement avec l'accord écrit de l'agrégateur. Pont n'encaisse, ne détient ni ne transfère de fonds → pas d'agrément BCEAO requis pour Pont (à faire valider par un juriste avant lancement).
- **Positionnement prix :** high ticket. Sandbox et développement gratuits ; payant au passage en production.

## 4. Périmètre du MVP

### 4.1 Inclus

| # | Domaine | Livrable |
|---|---|---|
| F1 | Connecteurs | 5 adaptateurs : **FedaPay, PayDunya, CinetPay, Kkiapay, PawaPay** (périmètre révisé selon ADR-001) (dépôt ; retrait si l'agrégateur le permet ; remboursement si dispo ; vérification) |
| F2 | API unifiée | REST `v1` : paiements, retraits, remboursements, événements, couverture |
| F3 | Sandbox Pont | Simulateur complet piloté par numéros magiques |
| F4 | Webhooks | Réception multi-agrégateurs, vérification, normalisation, re-signature, renvoi avec retries |
| F5 | CLI | `pont init`, `login`, `listen`, `trigger`, `replay`, `doctor`, `coverage` |
| F6 | SDK | TypeScript (cœur) + Next.js + React + Node/Express ; PHP + Laravel |
| F7 | WooCommerce | Plugin passerelle « connecter mon compte Pont », sans clé dans WordPress |
| F8 | MCP | Serveur MCP « intégration » (niveau 1) + fichier `AGENTS.md` généré |
| F9 | Dashboard | Connexion des clés, carte de couverture, paiements + timeline, webhooks, clés API, journal d'audit |
| F10 | Routage | Agrégateur préféré par pays/opérateur + failover **pré-push** uniquement |
| F11 | Sécurité | Voir §9 (non négociable) |
| F12 | Docs | Site de docs FR (EN plus tard), `llms.txt`, OpenAPI 3.1, quickstarts par stack |

### 4.2 Exclus du MVP (phase 2+)

Flutter, React Native/Expo, app Shopify, Python/Django, Symfony, PrestaShop ; agrégateurs supplémentaires (Moneroo, Notch Pay, PawaPay, FeexPay…) ; routage par coût ; MCP niveaux 2 (migration) et 3 (opérations) ; page de statut publique des opérateurs ; réconciliation et export comptable ; programme agences ; abonnements récurrents ; liens de paiement.

## 5. Parcours développeur (cible)

```text
1. Inscription sur pont.dev (GitHub / Google / e-mail + 2FA)           ~30 s
2. Terminal :  npx pont init                                           
   → détecte la stack (Next.js, Express, Laravel, PHP…)
   → ouvre le navigateur pour se connecter (device flow, aucune clé dans le terminal)
   → crée une clé API test restreinte, l'écrit dans .env.local
   → installe le SDK, génère : création de paiement, webhook, page retour
   → génère AGENTS.md + configure le MCP si --agent
   → lance un paiement test sur 0100000001
   → « ✅ Premier paiement test réussi en 41 s »                         < 5 min
3. pont listen --forward localhost:3000/api/pont/webhook  (tests locaux)
4. Dashboard : connecte ses clés FedaPay/PayDunya/… → carte de couverture
5. pont doctor  → audit sécurité de l'intégration (doit être vert)
6. Passage en live : clés live + doctor vert + 2FA obligatoires
```

Variante Laravel : `composer require pont/laravel && php artisan pont:install`.
Variante WooCommerce : installer le plugin → « Connecter Pont » (OAuth) → activer.
Variante agent IA : `npx pont init --agent` puis « Ajoute le paiement mobile money au checkout ».

## 6. Spécifications fonctionnelles

### F1 — Adaptateurs agrégateurs

Chaque adaptateur implémente le contrat `ProviderAdapter` (`packages/core`) :

| Capacité | FedaPay | PayDunya | CinetPay | Kkiapay |
|---|---|---|---|---|
| Créer un dépôt (checkout hébergé) | ✅ | ✅ | ✅ | ⚠️ widget front ; à confirmer côté serveur |
| Dépôt direct (push USSD) | à vérifier | ✅ (SOFTPAY) | à vérifier | ⚠️ |
| Vérifier un paiement | ✅ | ✅ | ✅ | ✅ `verify` |
| Retrait (payout) | ✅ | ✅ (API PUSH) | ✅ (transfert) | ⚠️ à vérifier |
| Remboursement | ❌ API non trouvée | à vérifier | à vérifier | ✅ (mobile money, frais non rendus) |
| Vérification webhook | signature en-tête | à vérifier | `x-token` HMAC | signature |
| Sandbox | ✅ | ✅ | ✅ | ✅ |

> **Tâche 0 du sprint 1 :** compléter cette matrice en lisant la doc officielle et en testant chaque sandbox. Les « à vérifier » bloquent le design final de l'adaptateur.

Exigences communes :
- Mapper les statuts natifs vers le modèle normalisé (§7.2) avec table de correspondance testée.
- Conserver la réponse brute (secrets masqués) pour la timeline.
- Normaliser les numéros (E.164 interne ; formats propres à chaque agrégateur en sortie ; préfixe `01` Bénin).
- Gérer les contraintes propres (ex. montant multiple de 5 chez CinetPay → validation explicite, jamais d'arrondi silencieux).
- Toujours confirmer l'état final par l'endpoint de vérification de l'agrégateur.

### F2 — API unifiée (v1)

Base : `https://api.pont.dev/v1`. Auth : `Authorization: Bearer pk_test_… | sk_live_…`.

| Méthode | Endpoint | Rôle |
|---|---|---|
| POST | `/payments` | Créer un dépôt (`Idempotency-Key` obligatoire) |
| GET | `/payments/:id` | Lire (déclenche une re-vérification si non final) |
| POST | `/payments/:id/refund` | Rembourser (si supporté) |
| POST | `/payouts` | Créer un retrait (`Idempotency-Key` obligatoire) |
| GET | `/payouts/:id` | Lire |
| GET | `/events` · `/events/:id` | Journal d'événements |
| POST | `/events/:id/resend` | Renvoyer un webhook |
| GET | `/coverage` | Couverture calculée sur les connexions du compte |
| GET | `/connections` | Agrégateurs connectés + état de santé |

Exemple :

```http
POST /v1/payments
Idempotency-Key: 6f1c…
{
  "amount": 5000,
  "currency": "XOF",
  "customer": { "phone": "+22901970000001", "name": "Awa K." },
  "method": "mobile_money",          // ou "card", ou omis = checkout hébergé
  "operator": "mtn_bj",              // optionnel ; auto-détecté depuis le numéro
  "reference": "order_4521",
  "return_url": "https://shop.bj/merci",
  "metadata": { "cart_id": "c_91" }
}
```

Réponse : objet `Payment` (§7.2) avec `status: "pending"`, `provider: "fedapay"`, `next_action` (`redirect` + URL, ou `await_customer` pour un push USSD).

Règles :
- Montants en **unités entières** de la devise (XOF/XAF n'ont pas de décimales).
- Le montant est **toujours fixé côté serveur** : les SDK front n'acceptent qu'un `payment_id` / `client_secret` créé par le backend.
- Erreurs : `{ "error": { "code": "insufficient_funds", "message_fr": "…", "message_en": "…", "fix": "…", "doc_url": "…" } }`.

### F3 — Sandbox Pont

Fonctionne **sans aucun compte agrégateur**. Clés `pk_test_` / `sk_test_` = sandbox ; jamais de mélange avec le live.

| Numéro magique | Scénario |
|---|---|
| `…0000001` | Succès immédiat |
| `…0000002` | Solde insuffisant |
| `…0000003` | Le client ne valide jamais → `expired` après le délai |
| `…0000004` | Succès + webhook envoyé deux fois |
| `…0000005` | Succès + webhook en retard (5 min) |
| `…0000006` | Agrégateur indisponible avant push → failover |
| `…0000007` | Statut ambigu (timeout réseau) → vérification, pas de nouvel essai |
| `…0000008` | Refus par le client sur son téléphone |

Préfixes selon le pays (`+22901…`, `+221…`, `+225…`). Le sandbox applique les **mêmes validations** que le live (formats, plafonds, montant multiple de 5 si l'adaptateur simulé est CinetPay).

### F4 — Webhooks

Entrée (agrégateurs → Pont) :
1. URL unique par connexion (`/hooks/{provider}/{connection_id}`), non devinable.
2. Vérification de la signature native de l'agrégateur. Échec → rejet + alerte.
3. **Jamais de confiance dans le contenu** : Pont appelle l'endpoint de vérification de l'agrégateur avant toute transition d'état.
4. Déduplication par identifiant d'événement natif.

Sortie (Pont → client) :
- Un seul format, signé **HMAC-SHA256** : en-tête `Pont-Signature: t=<timestamp>,v1=<signature>` ; tolérance de 5 min (anti-rejeu).
- Événements : `payment.succeeded`, `payment.failed`, `payment.expired`, `payment.refunded`, `payout.succeeded`, `payout.failed`, `connection.degraded`.
- Retries exponentiels sur 3 jours ; renvoi manuel depuis le dashboard, la CLI et le MCP.
- Livraison **au moins une fois** : les SDK fournissent un helper d'idempotence côté client.

### F5 — CLI `pont`

| Commande | Rôle |
|---|---|
| `pont init [--agent] [--stack next\|express\|laravel\|php]` | Intégration complète (§5) |
| `pont login` | Device flow navigateur ; jeton stocké dans le trousseau système |
| `pont listen --forward <url>` | Tunnel des webhooks vers localhost |
| `pont trigger <event>` | Déclenche un événement sandbox |
| `pont replay <event_id>` | Rejoue un événement |
| `pont doctor` | Audit sécurité et qualité de l'intégration (cf. §9.4) |
| `pont coverage [--country bj]` | Couverture des connexions actuelles |
| `pont logs --tail` | Flux des requêtes API |

Distribuée via `npx pont` (Node ≥ 20). Le générateur de code est **idempotent** : relancer `init` ne casse rien et affiche un diff avant d'écrire.

### F6 — SDK

| Paquet | Contenu |
|---|---|
| `@pont/node` | Client typé, `webhooks.verify()`, erreurs typées, retries + idempotence automatiques |
| `@pont/next` | Route handlers prêts à l'emploi (`createWebhookHandler`), server actions |
| `@pont/react` | `<PontCheckout>`, `<PayButton>`, `<PhoneInput>` (détection opérateur par préfixe), hooks `usePayment` |
| `pont/php` | Client PHP 8.1+ sans dépendance lourde, vérification webhook |
| `pont/laravel` | `php artisan pont:install`, facade `Pont::`, events (`PaymentSucceeded`…), contrôleur webhook, migration optionnelle |

Exigences : TypeScript strict, aucun `any`, Zod aux frontières ; PHP typé + PHPStan niveau max ; couverture de tests ≥ 80 % sur la vérification de signature et la machine d'états.

### F7 — Plugin WooCommerce

- Passerelle « Mobile Money & cartes (Pont) ».
- Connexion par OAuth au compte Pont : **aucune clé d'agrégateur dans WordPress**, seulement une clé Pont restreinte.
- Statut de commande mis à jour uniquement via webhook Pont vérifié + re-lecture API.
- Compatible WooCommerce HPOS et blocs de checkout.

### F8 — MCP (niveau 1 : intégration)

Serveur `@pont/mcp` (stdio + HTTP streamable), installé par `pont init --agent`.

| Outil | Rôle |
|---|---|
| `detect_stack` | Lit le projet et identifie framework, gestionnaire de paquets, structure |
| `scaffold_integration` | Génère les fichiers (retourne un diff ; l'agent applique) |
| `search_docs` | Recherche dans la doc Pont |
| `get_coverage` | Couverture par pays/opérateur/capacité pour le compte |
| `create_test_payment` | Crée un paiement sandbox avec un numéro magique |
| `simulate_webhook` | Déclenche un événement vers l'URL locale |
| `get_payment_timeline` | Timeline détaillée d'un paiement (secrets masqués) |
| `explain_error` | Explique un code d'erreur et propose le correctif |
| `run_doctor` | Lance l'audit et renvoie les points à corriger |

Ressources MCP : OpenAPI, `llms.txt`, guides par stack.

Garde-fous : le MCP de niveau 1 n'accepte **que des clés test**. Aucune opération live (paiement, retrait, remboursement) n'est exposée au MVP.

`AGENTS.md` généré dans le projet : règles d'intégration (montant serveur, vérification webhook, idempotence, ne jamais logger de secret, commandes à lancer pour tester).

### F9 — Dashboard

- **Connexions** : ajouter des clés d'agrégateur (test et live séparés), test de connexion immédiat, état de santé.
- **Carte de couverture** : matrice pays × opérateur × capacité (dépôt, retrait, remboursement), calculée sur les connexions ; suggestions (« connectez PayDunya pour Wave Sénégal »).
- **Paiements / retraits** : liste, filtres, timeline (requêtes et réponses brutes masquées, transitions d'état, webhooks).
- **Webhooks** : endpoints, livraisons, renvoi.
- **Développeurs** : clés API (restreintes, rotation, expiration), journaux de requêtes.
- **Routage** : agrégateur préféré par pays/opérateur, activation du failover.
- **Équipe & sécurité** : membres, rôles (owner, dev, lecture), 2FA obligatoire, journal d'audit.

### F10 — Routage et failover

- Règle MVP : agrégateur préféré par (pays, opérateur, capacité), sinon premier disponible.
- **Failover autorisé seulement si l'échec survient avant l'envoi de la demande au client** (erreur réseau à la création, 5xx, agrégateur marqué indisponible).
- Statut ambigu après envoi (timeout) → **vérification**, jamais de nouvel essai chez un autre agrégateur (risque de double débit).
- Disjoncteur par agrégateur et par opérateur sur taux d'erreur glissant.
- Chaque bascule est visible dans la timeline et émet `connection.degraded`.

## 7. Architecture

### 7.1 Vue d'ensemble

```text
 Dev / Agent IA ──► CLI · SDK · MCP · Plugin Woo
                          │  HTTPS (clé Pont)
                          ▼
                 ┌──────────────────────┐
                 │  API Pont (edge)      │  auth · rate limit · idempotence · validation Zod
                 ├──────────────────────┤
                 │  Orchestrateur        │  machine d'états · routage · failover · vérification
                 │  Adaptateurs          │  fedapay · paydunya · cinetpay · kkiapay · sandbox
                 ├──────────────────────┤
                 │  Webhooks in / out    │  vérif native · dédup · re-signature · retries
                 ├──────────────────────┤
                 │  Coffre à secrets     │  chiffrement enveloppe (KMS) des clés agrégateurs
                 └──────────────────────┘
                          │
              Convex (données, jobs planifiés, temps réel dashboard)
                          │
               Agrégateurs (sandbox / live)
```

### 7.2 Modèle de données (Convex, indicatif)

- `accounts` (organisation), `members` (rôle, 2FA), `apiKeys` (hash uniquement, préfixe visible, scopes, mode, expiration).
- `connections` : `provider`, `mode` (test/live), `encryptedCredentials` (chiffré enveloppe ; jamais renvoyé au client), `health`, `capabilities`.
- `payments` : `id` (`pay_…`), `accountId`, `mode`, `amount`, `currency`, `status`, `provider`, `providerRef`, `operator`, `customerPhoneHash` + 4 derniers chiffres, `reference`, `metadata`, `idempotencyKey`, timestamps.
- `payouts`, `refunds` : même logique.
- `attempts` : chaque appel agrégateur (requête/réponse masquées, durée, résultat) → timeline.
- `events`, `webhookDeliveries`, `auditLog`, `routingRules`, `providerHealth`.

États normalisés d'un paiement :

```text
created ─► pending ─► processing ─► succeeded ─► refunded / partially_refunded
                 │             └──► failed
                 └──────────────────► expired / cancelled
```

Transition vers `succeeded` **uniquement** après vérification auprès de l'agrégateur.

### 7.3 Choix techniques

| Élément | Choix | Raison |
|---|---|---|
| Monorepo | pnpm workspaces + changesets | Même pattern que `moneroo-tools` |
| Langage | TypeScript strict, Zod aux frontières | Conventions globales |
| Dashboard | Next.js (App Router) + shadcn/ui + Tailwind | Stack maîtrisée |
| Backend / données | Convex (+ actions HTTP pour l'API et les webhooks) | Temps réel dashboard, jobs planifiés, retries |
| Hébergement | Vercel (dashboard, docs) + Convex | |
| Secrets | Chiffrement enveloppe ; clé maître dans un KMS (Vercel KMS ou AWS KMS) | Jamais de clé agrégateur en clair en base |
| Rate limit / idempotence | Upstash Redis | Faible latence, TTL |
| Docs | Mintlify ou Fumadocs + OpenAPI + `llms.txt` | Lisible par humains et agents |
| CLI | Node, `commander`/`clack`, tunnel WebSocket pour `listen` | |
| PHP | PHP 8.1+, Composer, PHPStan, Pest | |

> Point à trancher en sprint 0 : l'API publique en actions HTTP Convex suffit-elle (latence, contrôle des en-têtes, rate limit), ou faut-il une couche API dédiée (Hono sur Vercel Functions) devant Convex ?

## 8. Exigences non fonctionnelles

| Exigence | Cible MVP |
|---|---|
| Time-to-first-payment (sandbox) | < 5 min, mesuré par télémétrie CLI (opt-in) |
| Latence API Pont (hors agrégateur) | p95 < 300 ms |
| Disponibilité API | 99,9 % |
| Perte de webhook | 0 (stockage avant traitement, retries 3 jours) |
| Langues | FR d'abord ; messages d'erreur FR + EN |
| Rétention | Logs détaillés 30 jours ; paiements selon obligation légale |

## 9. Sécurité (non négociable)

### 9.1 Secrets
- Clés agrégateurs chiffrées (enveloppe, KMS), déchiffrées uniquement en mémoire dans l'action qui appelle l'agrégateur.
- Jamais affichées après enregistrement, jamais loggées, masquées dans toutes les traces.
- Clés API Pont : stockées hachées ; préfixes `pk_`/`sk_` + `test`/`live` ; scopes ; expiration ; rotation sans coupure.
- Détection de fuite : préfixes de clés déclarés au GitHub Secret Scanning partner program (phase 2).

### 9.2 Intégrité des transactions
- Montant fixé côté serveur ; les SDK front ne prennent pas de montant.
- `Idempotency-Key` obligatoire sur toute création ; même clé + corps différent → erreur 409.
- Vérification auprès de l'agrégateur avant tout `succeeded`.
- Pas de nouvel essai sur statut ambigu (anti-double débit).
- Webhooks sortants signés, horodatés, anti-rejeu.

### 9.3 Plateforme
- 2FA obligatoire pour le live ; rôles ; journal d'audit immuable.
- Rate limiting par clé et par IP ; protection contre l'énumération.
- Données personnelles minimisées (téléphone haché + 4 derniers chiffres) ; conformité lois de protection des données (APDP Bénin, CDP Sénégal, ARTCI CI).
- Revue de sécurité avant le live ; test d'intrusion avant ouverture publique.

### 9.4 `pont doctor` (audit de l'intégration du client)
- Clé secrète présente dans le bundle front ou dans le dépôt Git.
- Endpoint webhook non vérifié ou non HTTPS.
- Montant transmis depuis le client.
- Absence de gestion d'idempotence côté handler.
- Statut lu depuis le paramètre de l'URL de retour au lieu de l'API.
- Résultat : score + correctifs, exécutable en CI (`pont doctor --ci`).

## 10. Stacks supportées

| Vague | Stacks |
|---|---|
| MVP | Next.js, React, Node/Express, PHP natif, Laravel, WooCommerce/WordPress |
| Phase 2 | Flutter, React Native/Expo, app Shopify, recettes Convex/Supabase, Python/Django |
| Phase 3 | Symfony, PrestaShop, NestJS, Bubble/no-code |

Starters (`npx create-pont-app`) : Next.js + Convex + shadcn ; Laravel + Inertia/React ; Laravel + Livewire.

## 11. Offre commerciale (hypothèse à valider)

| Plan | Contenu | Prix indicatif |
|---|---|---|
| Développeur | Sandbox illimité, CLI, MCP, docs | Gratuit |
| Startup | Live, 4 agrégateurs, failover, support e-mail | Abonnement mensuel (à fixer) |
| Scale | Routage avancé, SLA, support WhatsApp dédié | Abonnement + accompagnement |
| Intégration accompagnée | Setup fait avec l'équipe, revue sécurité | Forfait setup (high ticket) |

Pas de commission sur le volume au MVP : cela pousserait vers la détention de fonds et donc vers l'agrément.

## 12. Indicateurs de succès du MVP

- 10 startups en production dans les 90 jours suivant le lancement.
- Médiane time-to-first-payment < 5 min.
- ≥ 30 % des intégrations réalisées via `--agent` / MCP.
- 0 incident de sécurité ; 0 webhook perdu.
- 3 clients payants avant d'ajouter un 5ᵉ agrégateur.

## 13. Planning indicatif (12 semaines)

| Sprint (2 sem.) | Objectif |
|---|---|
| S0 | Matrice de capacités vérifiée (tâche 0), décisions d'architecture, comptes sandbox des 4 agrégateurs |
| S1 | `core` (modèle, machine d'états), sandbox Pont, API `payments` |
| S2 | Adaptateurs FedaPay + Kkiapay, webhooks in/out, coffre à secrets |
| S3 | Adaptateurs PayDunya + CinetPay, payouts, routage + failover pré-push |
| S4 | CLI (`init`, `listen`, `trigger`, `doctor`), SDK Node/Next/React, MCP niveau 1 |
| S5 | SDK PHP/Laravel, plugin WooCommerce, dashboard (couverture, timeline) |
| S6 | Docs + `llms.txt`, revue sécurité, bêta privée avec 5 startups |

## 14. Risques

| Risque | Mitigation |
|---|---|
| **Confirmé le 2026-10-26 :** FedaPay et Kkiapay interdisent de confier les clés à un tiers ; Kkiapay interdit le multi-agrégateurs | Voir `docs/metier/decisions/ADR-001-cgu-et-modele-byok.md` (décision en attente) |
| Qualification réglementaire de Pont (prestataire technique vs service de paiement) | Avis juridique BCEAO avant le live |
| Fuite de clés agrégateurs | Chiffrement enveloppe, accès minimal, audit, pentest |
| API agrégateurs instables ou non documentées | Tests de contrat quotidiens contre les sandboxes ; alertes |
| Concurrence (Notch Pay, Hub2, PawaPay, WariMCP) | Différenciation par l'expérience dev, le sandbox et la sécurité |
| Pi-SPI (BCEAO) change le paysage inter-opérateurs | Veille ; adaptateur Pi-SPI via un partenaire agréé en phase 2+ |

## 15. Questions ouvertes

1. Nom définitif et domaine.
2. Couche API : actions HTTP Convex ou API dédiée devant Convex (S0).
3. KMS : Vercel KMS ou AWS KMS.
4. CGU des 4 agrégateurs sur l'usage des clés par un orchestrateur.
5. Prix des plans.
6. Moneroo (déjà maîtrisé, MCP existant) en 5ᵉ adaptateur dès le MVP ?
