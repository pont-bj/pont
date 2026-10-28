# Checklist avant de rendre le dépôt public

À cocher dans l'ordre. Ne rends le dépôt public qu'une fois tout validé.

## 1. Secrets et données

- [ ] Installer gitleaks (par toi, depuis le site officiel) puis lancer sur tout l'historique : `gitleaks detect --source . --log-opts="--all" --redact`
- [ ] Recherche ciblée complémentaire (sans afficher les valeurs) : `git log -p --all | grep -ciE "(api[_-]?key|secret|token|password|BEGIN (RSA|PRIVATE))"` puis inspecter chaque occurrence avec `git log -S"<motif>" --all --oneline`
- [ ] Si un secret a existé dans l'historique : le **révoquer et le renouveler** chez le fournisseur d'abord, puis seulement réécrire l'historique (git filter-repo) ou repartir d'un dépôt neuf
- [ ] Vérifier qu'aucun `.env*` n'est suivi : `git ls-files | grep -E "(^|/)\.env"` (seul `.env.example` est permis)
- [ ] Vérifier les fichiers volumineux ou locaux suivis (bases SQLite, dumps, `apps/dashboard/data/`, exports)
- [ ] Retirer ou anonymiser les données de test réelles (numéros, noms, e-mails, identifiants de transaction)
- [ ] Relire les docs et `CLAUDE.md` pour les mentions internes (chemins locaux, notes `~/Brain`, clients, tarifs, contacts, plans commerciaux non publics) ; décider de ce qui reste public (`docs/plan/`, `docs/legal/CGU-brouillon.md`, `skills-lock.json`)

## 2. Cadre juridique

- [ ] Choix de la licence (voir `docs/licence/`), ajout du fichier `LICENSE` et de l'en-tête dans les `package.json` (aujourd'hui `UNLICENSED`)
- [ ] `CLA.md` relu et validé par un juriste (droit béninois / OHADA, droit d'auteur)
- [ ] `TRADEMARK.md` validé ; envisager un dépôt de marque (OAPI) et vérifier la disponibilité du nom « Pont » (nom de code)
- [ ] Vérifier les licences des dépendances

## 3. Paramétrage GitHub

- [ ] Activer la 2FA sur le compte propriétaire (et exiger la 2FA pour l'organisation éventuelle)
- [ ] Protection de la branche `main` : PR obligatoire, au moins 1 revue, CI verte requise, branche à jour, **force-push et suppression interdits**, inclure les administrateurs
- [ ] Activer : alertes Dependabot, mises à jour de sécurité, Secret scanning + push protection, signalement privé de vulnérabilité, code scanning (CodeQL) si souhaité
- [ ] Activer les Issues ; désactiver ce qui est inutile (Wiki, Projects)
- [ ] Ajouter les labels (`bug`, `enhancement`, `cla-signé`)
- [ ] Vérifier que la CI passe sur `main` sans aucun secret configuré

## 4. Placeholders à remplacer

État au 28 octobre 2026 : contacts, propriétaire et URL du dépôt sont renseignés. **Provisoire** : `aboudou-cto-bloko/pont` et `https://github.com/aboudou-cto-bloko/pont` supposent que le dépôt portera ce nom ; à corriger si le nom définitif change (`git grep -n "aboudou-cto-bloko/pont"` et `scripts/publish-meta.json`).

| Placeholder | Où | État |
|---|---|---|
| `<CONTACT_SECURITE>`, `<CONTACT_CONDUITE>`, `<CONTACT_MARQUE>` | `SECURITY.md`, `CODE_OF_CONDUCT.md`, `TRADEMARK.md` | fait : pro@aboudouzinsou.com |
| `@OWNER` | `.github/CODEOWNERS` | fait : `@aboudou-cto-bloko` |
| `OWNER/REPO` | `.github/ISSUE_TEMPLATE/config.yml` | fait (provisoire) |
| `<URL_DU_DEPOT>` | `CONTRIBUTING.md` | fait (provisoire) |
| `<DROIT_APPLICABLE_ET_JURIDICTION>` | `CLA.md` | **volontairement laissé**, à fixer avec le juriste |

Contrôle final : `grep -rnE "<CONTACT_|@OWNER|OWNER/REPO|<URL_DU_DEPOT>|<DROIT_APPLICABLE" --exclude-dir=node_modules --exclude-dir=.git .` ne doit retourner que `CLA.md` (et cette checklist) tant que le juriste n'a pas validé.

## 5. Dernière étape

- [ ] Relire le README (statut honnête : aucun vrai agrégateur contacté)
- [ ] Rendre le dépôt public, puis vérifier le rendu des modèles d'issue et de PR
