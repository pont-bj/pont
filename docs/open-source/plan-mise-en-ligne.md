# Plan de mise en ligne : de zéro à l'annonce

Marqueurs : **AGENT** = fait ou faisable par un agent (état indiqué) ; **HUMAIN** = action manuelle, qu'un agent ne doit pas faire à ta place. Rien n'a été publié, committé ni poussé. Documents liés : `checklist-publication.md`, `publication-npm.md`, `audit-secrets.md`, `docs-internes.md`.

## Phase 0 : décisions (HUMAIN)

1. **HUMAIN** Choisir le nom définitif. `pont` et `pont-cli` existent sur npm ; vérifier aussi le domaine, le dépôt GitHub, l'OAPI (marque), Packagist. Tant que ce n'est pas fait, ne publie ni paquet ni dépôt public.
2. **HUMAIN** Valider la licence BUSL-1.1 (`LICENSE`, `NOTICE`, `docs/licence/`) avec un juriste : paramètres (usage additionnel, date de conversion, licence cible), `CLA.md`, `TRADEMARK.md`, droit applicable (`CLA.md`).
3. **HUMAIN** Faire valider la politique de confidentialité (`apps/landing/app/confidentialite/page.tsx`) au regard de la loi béninoise sur les données personnelles, et décider de la durée de conservation de la liste d'attente.
4. **HUMAIN** Décider de l'e-mail des commits (voir `audit-secrets.md`, point 1) et du mode de publication : historique conservé ou dépôt neuf.

## Phase 1 : préparation du dépôt (AGENT, fait)

5. **AGENT (fait)** Contacts (`pro@aboudouzinsou.com`), `CODEOWNERS`, URLs du dépôt (provisoires) renseignés.
6. **AGENT (fait)** Métadonnées npm, `README.md` par paquet, `private: true` sur `@pont/server` et les apps, vérification des tarballs. Refaire si le nom change : `node scripts/apply-publish-meta.mjs`.
7. **AGENT (fait)** Audit de secrets (0 fuite réelle) ; références `~/Brain` retirées.
8. **AGENT (fait)** `ROADMAP.md`, `CHANGELOG.md`, politique de confidentialité, workflow `release.yml`.
9. **AGENT (à faire, après décision 4)** Appliquer `docs-internes.md` : retirer `docs/plan/demo*`, `docs/legal/CGU-brouillon.md`, `skills-lock.json`, `.claude/`, sections commerciales du cahier des charges ; adopter `CLAUDE.public.md`.
10. **AGENT (à faire)** Ajouter à la landing le lien « Confidentialité » vers `/confidentialite` dans `apps/landing/app/page.tsx` (le propriétaire s'en charge).
11. **AGENT (à faire)** Vérification finale :
    ```bash
    pnpm install --frozen-lockfile && pnpm -r typecheck && pnpm -r build && pnpm -r test
    grep -rnE "<CONTACT_|@OWNER|OWNER/REPO|<URL_DU_DEPOT>" --exclude-dir=node_modules --exclude-dir=.git .
    ```

## Phase 2 : sécurité avant ouverture (HUMAIN)

12. **HUMAIN** Installer gitleaks depuis le site officiel puis : `gitleaks detect --source . --log-opts="--all" --redact`. Toute trouvaille : révoquer chez le fournisseur d'abord.
13. **HUMAIN** Vérifier le droit de redistribuer `docs/providers/` et les logos des agrégateurs.
14. **HUMAIN** Relire le `README.md` (statut honnête : aucun vrai agrégateur éprouvé).

## Phase 3 : GitHub (HUMAIN)

15. **HUMAIN** Activer la 2FA sur le compte `aboudou-cto-bloko`.
16. **HUMAIN** Créer le dépôt, **privé d'abord** :
    ```bash
    gh repo create aboudou-cto-bloko/pont --private --source . --remote origin
    git push -u origin main        # le premier push est une action humaine
    ```
    (Pour un dépôt neuf sans historique : copier l'arbre propre dans un dossier vide, `git init`, premier commit en français, puis `gh repo create`.)
17. **HUMAIN** Activer : Dependabot (alertes + mises à jour de sécurité), secret scanning + push protection, signalement privé de vulnérabilité, CodeQL (optionnel), Issues (Wiki et Projects désactivés). Créer les labels `bug`, `enhancement`, `cla-signé`.
18. **HUMAIN** Protection de `main` (Settings > Branches ou `gh api`) : PR obligatoire, 1 revue, CI `verifier` requise, branche à jour, force-push et suppression interdits, administrateurs inclus.
19. **HUMAIN** Vérifier que la CI passe sur `main` sans aucun secret configuré.

## Phase 4 : npm (HUMAIN, après l'étape 1)

20. **HUMAIN** Créer l'organisation npm (scope), activer la 2FA obligatoire, créer le jeton granulaire, l'enregistrer en secret `NPM_TOKEN`, créer l'environnement `npm-publication` avec validation : détail dans `publication-npm.md`.
21. **AGENT/HUMAIN** Lancer le workflow « Publication npm » en simulation, relire le journal, puis publication réelle (tag `v0.1.0`) par l'humain.
22. **AGENT** Tester dans un projet vierge : `pnpm add @pont/node` et `npx @pont/cli --help`.

## Phase 5 : site (HUMAIN)

23. **HUMAIN** Déployer la landing sur Vercel avec les variables d'environnement (jamais committées) : `LANDING_SECRET`, `NEXT_PUBLIC_SITE_URL`, URL Convex. Vérifier `/confidentialite` en production, le formulaire, l'image OpenGraph.
24. **HUMAIN** Déployer la documentation (`apps/docs`), configurer les domaines.
25. **HUMAIN** Mettre en place la désinscription et la suppression sur demande : le formulaire promet « Désinscription en un clic », mais aucun mécanisme n'existe dans le code (voir rapport). Corriger la promesse ou développer le mécanisme avant d'envoyer le premier e-mail.

## Phase 6 : mise en public et annonce (HUMAIN)

26. **HUMAIN** Rendre le dépôt public : `gh repo edit aboudou-cto-bloko/pont --visibility public --accept-visibility-change-consequences`. Vérifier le rendu des modèles d'issue et de PR.
27. **HUMAIN** Créer la release GitHub `v0.1.0` à partir de `CHANGELOG.md`.
28. **HUMAIN** Annoncer (LinkedIn, X, communautés développeurs francophones, Product Hunt/Hacker News éventuellement) avec un message honnête : sandbox, `0.x`, aucun agrégateur éprouvé en production, licence à code source disponible (BUSL-1.1, pas « open source » au sens strict avant conversion).

## Après l'annonce

Premières 72 heures, puis chaque semaine :

- **Modération des issues (HUMAIN, avec aide d'agent pour le tri)** : répondre sous 48 h ouvrées ; étiqueter (`bug`, `enhancement`, `question`) ; fermer les doublons en renvoyant vers l'issue d'origine ; appliquer `CODE_OF_CONDUCT.md` (avertissement, puis blocage) ; ne jamais demander de clés d'API réelles en public ; si quelqu'un colle un secret, le faire révoquer et éditer le message.
- **Sécurité** : vulnérabilités via le signalement privé GitHub ou pro@aboudouzinsou.com, accusé de réception sous 72 h (voir `SECURITY.md`).
- **Réponses types** : préparer 4 modèles (merci et demande de reproduction ; hors périmètre avec renvoi vers `docs/ROADMAP.md` ; question de licence avec renvoi vers `docs/licence/FAQ.md` ; contribution avec renvoi vers `CONTRIBUTING.md` et `CLA.md`).
- **Pull requests** : vérifier la signature du CLA, la CI verte, le respect des règles de `CLAUDE.md`.
- **Feuille de route** : publier `docs/ROADMAP.md` (déjà rédigée) sur la page d'accueil du dépôt et dans l'annonce ; la mettre à jour à chaque version ; tenir `CHANGELOG.md`.
- **Mesure** : suivre étoiles, inscriptions à la liste d'attente, issues ouvertes/fermées, sans outil de suivi intrusif (la politique de confidentialité dit qu'il n'y en a pas : la modifier avant d'en ajouter un).
- **Retour d'expérience** : tester avec de vrais comptes agrégateurs, documenter les écarts, publier les corrections.
