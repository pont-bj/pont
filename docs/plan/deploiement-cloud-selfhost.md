# Pont : modes de déploiement, clés et authentification

Statut : décisions validées le 2026-10-27, rien n'est encore implémenté.

## Décisions

1. **Self-host gratuit à vie.** Le même code, open core, tourne sur le serveur du client.
2. **Pont Cloud payant.** Version hébergée et gérée par nous.
3. **Pont conserve les clés des agrégateurs** (Cloud). Elles sont chiffrées, jamais en clair, jamais dans les logs ni dans les réponses.
4. **Chiffrement par client** : recommandé (voir plus bas).
5. **Authentification intégrée** via Better Auth (à confirmer : le terme employé était « BetterHost »).
6. **Détection de la stack** par `pont init` et l'agent IA, avec skills adaptés.

## Deux modes, un seul code

| | Self-host | Pont Cloud |
|---|---|---|
| Prix | Gratuit | Payant |
| Backend | Convex self-hosted (Docker) ou Prisma | Géré par Pont |
| Dashboard | Sur le serveur du client | Hébergé |
| Clés agrégateurs | Variables d'environnement du client | Stockées chiffrées par Pont |
| Webhooks | Reçus par le serveur du client | Reçus par Pont, relayés à l'appli |

Self-host : un `docker-compose` avec backend Convex, dashboard et moteur Pont. `packages/store-convex` est déjà compatible, `packages/store-prisma` couvre les autres.

## Clés des agrégateurs (Cloud)

Chiffrement par enveloppe :
- une clé maître (KMS ou secret d'infrastructure, jamais en base) ;
- une clé de données par client, chiffrée par la clé maître ;
- les clés d'agrégateurs chiffrées (AES-256-GCM) avec la clé du client ;
- déchiffrement uniquement en mémoire, au moment de l'appel à l'agrégateur ;
- rotation possible de la clé d'un client sans toucher aux autres ;
- journal d'audit de chaque accès à une clé.

Conséquences à traiter :
- Pont garde les clés, pas les fonds : le positionnement « non-custodial » porte sur l'argent. La landing dit aujourd'hui « tes clés restent chez toi » : à réécrire pour le Cloud, et à garder pour le self-host.
- Le Cloud devient une infrastructure critique (webhooks, disponibilité) : prévoir sauvegardes et journalisation.
- Règle conservée : un paiement passe à `succeeded` seulement après `adapter.verify()`.

## Authentification

Module `auth` du framework, préconfiguré avec Better Auth (adaptateur Convex existant). L'utilisateur est lié à son portefeuille et à son registre : un seul `pont init` donne inscription, connexion, portefeuille et paiements.

### Rôles définis par le développeur

Le développeur déclare les rôles de sa fintech (`pont.config.ts`, puis dashboard) et Pont génère la configuration Better Auth correspondante (plugins `admin` et `organization` avec contrôle d'accès).

- Permissions portées sur les ressources Pont : paiements, retraits, portefeuilles, registre, webhooks, clés. Vérifiées côté serveur à chaque opération.
- Un rôle peut porter un plafond KYC, appliqué par `ledger/limits.ts`.
- Les recettes installent des rôles par défaut (portefeuille : client, agent, admin ; tontine : membre, trésorier, président).
- Les rôles sont modifiables depuis le dashboard sans redéploiement. Règle de conflit entre fichier et base : à décider.
- Le serveur MCP peut générer les rôles à partir d'une description de la fintech.

## Détection de la stack

`pont init` lit le projet (Next.js, Convex, Prisma, Express, Laravel/PHP), génère la configuration, puis le serveur MCP (`packages/mcp/src/knowledge.ts`) donne à l'agent les skills et la documentation de cette stack. Templates existants : Next.js, Convex. À ajouter : Prisma, Express.

## À construire

- [x] `docker-compose` self-host (serveur, dashboard, stockage Convex ou PostgreSQL), voir `docs/self-host/`
- [x] Module `auth` : rôles et permissions (`packages/auth`), Better Auth dans le dashboard, voir `docs/self-host/roles-et-authentification.md`. Reste : plafonds KYC appliqués, organisations, 2FA
- [x] Coffre à clés chiffrées, clé maître unique (self-host), voir `docs/self-host/cles-et-webhooks.md`
- [ ] Coffre par client en enveloppe + journal d'audit (Cloud)
- [x] E-mail : SMTP configurable depuis le dashboard (mot de passe oublié) et alertes configurables avec historique, voir `docs/self-host/email-et-alertes.md`. Reste : e-mail de vérification, invitations, modèles personnalisables
- [x] Outil CLI d'intégration d'agrégateur personnalisé : questions (endpoints, noms des clés, signature et format des webhooks, correspondance des statuts) puis génération d'un adaptateur `ProviderAdapter` branché sur le coffre et la page Clés — fait : `pont provider new` + chargement par `PONT_PLUGINS_DIR`, voir `docs/self-host/integration-agregateur.md`. Reste : essai contre un vrai sandbox d'agrégateur, signatures asymétriques, OAuth
- [ ] Détection de stack étendue et skills par stack
- [x] Dashboard branché sur les données réelles (aperçu, paiements, utilisateurs, rôles, portefeuilles, registre, clés, webhooks)
- [x] Mise en production self-host : profil Docker `prod` (Caddy, 80/443 seulement), `setup.sh --prod`, guide `docs/self-host/mise-en-production.md`
- [ ] Facturation Pont Cloud (offres, quotas)
- [ ] Mise à jour de la landing et du script vidéo (gratuit pendant le lancement devient : self-host gratuit, Cloud payant)
