# Backlog

## Fait

| ID | Tâche | Agent | Statut |
|---|---|---|---|
| T-000 | Capacités + CGU des agrégateurs | metier | ✅ 2026-10-26 |
| T-007 | Fiche PawaPay | metier | ✅ (CGU non publiques ⏳) |
| T-020 | Documentation agrégateurs téléchargée (`docs/providers/`) | backend | ✅ (CinetPay injoignable) |
| T-021 | `@pont/core` : modèle, erreurs FR, états, téléphone, signatures HMAC + RFC 9421, HTTP, Zod | backend | ✅ |
| T-022 | `@pont/sandbox` : 8 numéros magiques | backend | ✅ |
| T-023 | Adaptateurs : dépôts, vérification, webhooks (5 agrégateurs) | backend | ✅ |
| T-024 | `@pont/engine` : idempotence, routage, failover sûr, réconciliation, intégrité | backend | ✅ |
| T-010 | PawaPay : vérification complète RFC 9421 des callbacks | backend | ✅ 2026-10-27 |
| T-012 | Retraits : FedaPay, PawaPay, PayDunya | backend | ✅ 2026-10-27 |
| T-013 | Remboursements : PawaPay (total/partiel), Kkiapay (total) + cumul côté moteur | backend | ✅ 2026-10-27 |
| T-015 | Relais de webhooks sortants : reprises ~3 jours, signature par tentative, anti-SSRF, renvoi manuel | backend | ✅ 2026-10-27 |
| T-018 | `@pont/node` : configuration par variables d'env, route Next.js, handler `Request` | backend | ✅ 2026-10-27 |
| T-026 | Audit de fidélité à la doc (`docs/metier/fidelite-doc.md`), suppression des statuts inventés | backend + metier | ✅ 2026-10-27 |
| T-017 | `@pont/store-convex` : stores persistants (paiements, retraits, remboursements, idempotence, livraisons), secret partagé | backend | ✅ 2026-10-27 |
| T-027 | Réconciliation (`engine.reconcile`) + route cron protégée (`createCronRoute`) | backend | ✅ 2026-10-27 |
| T-019a | CLI `pont` : `init` (Next.js App Router, Express ; env, .gitignore, AGENTS.md, paiement test), `doctor` (9 contrôles, mode `--ci`), `trigger` | backend | ✅ 2026-10-27 |
| T-019b | MCP niveau 1 : 8 outils + 7 ressources de doc, sandbox uniquement, testé en mémoire et en stdio | backend | ✅ 2026-10-27 |
| T-031 | Correction FedaPay selon `payment-methods.md` : code `mtn_open`, opérateurs par pays, `mode` des retraits | backend | ✅ 2026-10-27 |
| T-029 | Build tsup + `publishConfig` ; paquets vérifiés installés depuis tarballs dans un projet vierge (API, CLI, MCP sans tsx) | backend | ✅ 2026-10-27 (publication npm en attente : nom + accord) |
| T-030 | `pont init --stores convex` : tables, fonctions, schéma (créé ou étape manuelle), secret, relais branché ; fichiers générés compilés | backend | ✅ 2026-10-27 |
| T-014 | PawaPay Orange Burkina (PREAUTH) : `preAuthorisationCode`, instructions FR/EN de la doc | backend | ✅ 2026-10-27 |
| T-001 | ADR-001 accepté : hybride, clés chez le marchand, instructions signées | metier | ✅ 2026-10-27 |
| T-032 | Instructions signées (R-020) côté marchand : Ed25519, ± 5 min, nonce, périmètre, plafond, audit | backend | ✅ 2026-10-27 |
| T-033 | Brouillon des CGU (`docs/legal/CGU-brouillon.md`) | metier | ✅ brouillon, juriste requis |

Tests : 129 (core 11, engine 76, node 12, store-convex 6, cli 17, mcp 7). Typecheck : 0 erreur sur 12 paquets.

## Décisions en attente (François)

| ID | Tâche | Statut |
|---|---|---|
| T-002 | Lire les CGU CinetPay, statuer sur son maintien | ⏳ |
| T-004 | Demandes de partenariat (FedaPay, PayDunya, PawaPay, Kkiapay) | ⏳ |
| T-005 | Tests réels en sandbox | ❌ impossible pour l'instant ; compensé par `fidelite-doc.md` et R-018 |

## Reste à faire (back-end)

| ID | Tâche | Agent | Note |
|---|---|---|---|
| T-016 | Cloud Pont (Convex) : comptes, clés API hachées, sandbox hébergé, journal (métadonnées sans secret) | backend | |
| T-019c | `pont listen` (nécessite le relais du cloud Pont) | backend | après T-016 |
| T-034 | Choisir le nom définitif (`pont` est pris sur npm) puis publier | François | ⏳ |
| T-011 | CinetPay : vérification `x-token` + endpoint de statut confirmés | backend | après T-002 |
| T-025 | SDK PHP / Laravel, plugin WooCommerce | backend | |
| T-028 | Valider `@pont/store-convex` sur un vrai déploiement Convex (les tests tournent sous `convex-test`) | backend | |
| T-008 | Maquettes Lunacy du dashboard | frontend | ✅ 7 écrans validés 2026-10-27 |

## Framework (ADR-003)

| ID | Tâche | Agent | Note |
|---|---|---|---|
| T-040 | Contrat de module, moteur de workflows avec compensation, format de recette (`@pont/framework`) | code-principal | ✅ v1 2026-10-27 ; limites → T-045 |
| T-045 | Workflows durables : persister chaque étape, reprise après crash, verrou par clé d'idempotence | backend | ✅ 2026-10-27 |
| T-041 | `@pont/store-prisma` (Prisma Postgres) : mêmes stores que Convex + runs de workflows | backend | ✅ 2026-10-27, testé sur Postgres 16 réel |
| T-042 | Modules `ledger` (partie double), `wallets`, `limits` (`@pont/ledger`) + règles R-030 à R-036 | backend + metier | ✅ mémoire 2026-10-27 ; Postgres → T-046 |
| T-046 | Stockage Prisma du registre, R-031 vérifiée sous concurrence réelle | backend | ✅ 2026-10-27 (50 retraits / 20 connexions) |
| T-043 | Recette « Portefeuille mobile » de bout en bout + `pont add recipe` + MCP `list_recipes` / `apply_recipe` | backend | |
| T-044 | Licence et découpage open source / propriétaire | François | |
