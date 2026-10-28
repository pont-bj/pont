# Audit de secrets (dépôt et historique git)

Date : 28 octobre 2026. Aucune valeur secrète n'est reproduite ici : seulement le type, le fichier et la ligne.

## Méthode

- Fichiers non suivis (nouveaux documents juridiques, `.github/`, etc.) : même recherche, rien de réel. Fichiers suivis : `git ls-files` (636 fichiers) passés à des expressions régulières ciblées.
- Historique : `git log -p --all -U0` (24 commits, 1 branche locale, aucun distant), lignes **ajoutées** examinées, par motif et par fichier.
- Motifs : clés `sk_live/sk_test`, `whsec_`, `pk_/rk_`, jetons GitHub (`ghp_…`), jetons npm, clés AWS, clés privées PEM, JWT, affectations `api_key/secret/token/password = "…"`, adresses Gmail/Yahoo/Hotmail/Outlook/iCloud/Proton, chemins `/home/…`, `~/Brain`, URL de base de données avec mot de passe.
- Fichiers sensibles : `.env*`, bases SQLite, `.pem`, `.key`, y compris dans l'historique.
- Limite : outil maison, pas gitleaks. Lancer aussi gitleaks (étape HUMAIN de `plan-mise-en-ligne.md`).

## Résultat

Aucun secret réel détecté, ni dans l'arbre de travail, ni dans l'historique : tout ce qui a existé dans l'historique existe encore dans l'arbre (les compteurs « historique » sont identiques à ceux de l'arbre).

| Type | Occurrences | Verdict | Détail |
|---|---|---|---|
| Clé `sk_` | 1 | faux positif | fixture de test fictive, `packages/server/test/control.test.ts:156` (valeur répétitive évidente) |
| `whsec_` | 7 | faux positifs | secrets de test fictifs : `packages/server/test/control.test.ts` (lignes 69, 93, 106, 130, 156), `packages/engine/test/engine.test.ts` (299, 300) |
| Clé AWS | 1 | faux positif | exemple de documentation : `.claude/skills/security-review/references/supply-chain.md:149` |
| Affectation secret/mot de passe | 74 | faux positifs | exemples de la documentation officielle des agrégateurs copiée dans `docs/providers/` (PayDunya environ 40, Kkiapay 16, FedaPay 14), plus 2 fixtures de test (`packages/server/test/email.test.ts`, `control.test.ts`) et un champ de formulaire (`apps/dashboard/components/formulaire-auth.tsx`) |
| URL de base de données avec mot de passe | 7 | faux positifs / valeurs de dev | modèles `docker-compose.yml:13,188` (mot de passe injecté par variable), exemple de docs `stockage.mdx:36` et `adaptateurs-stockage.md:20` (`motdepasse@hote`), valeur locale de développement dans `packages/store-prisma/prisma.config.ts:5` et les tests `store-prisma/test/*.test.ts` (base locale). À remplacer par une variable obligatoire si on veut zéro occurrence |
| E-mail personnel (Gmail…) | 13 | tiers, non sensible | adresses d'exemple de la documentation des agrégateurs : `docs/providers/kkiapay/llms-full.txt` (10), `paydunya/NodeJS.html` et `.txt` (2), `fedapay/openapi.json:154` (1). Ce ne sont pas des adresses du propriétaire. Contenu tiers copié : voir « À faire » |
| Chemin `/home/…` | 0 | | |
| Référence `~/Brain` | 2 | **corrigé** | `CLAUDE.md:6` et `docs/CAHIER-DES-CHARGES.md:12` : lignes supprimées |
| Jetons GitHub, npm, JWT, clé privée PEM | 0 | | |
| Fichier `.env*` suivi | 1 | conforme | seul `deploy/self-host/.env.example` est suivi, ses variables secrètes sont vides |
| Base de données / dump / `.pem` suivi | 0 | | |

Total : **0 fuite réelle**, **2 fuites triviales corrigées** (références à `~/Brain`), environ 100 faux positifs ou contenus tiers.

## Points d'attention (hors regex)

1. **Adresse e-mail des commits.** L'historique contient l'adresse e-mail de l'auteur des 24 commits (domaine `bloko.me`, nom « Aboudou ZINSOU »). Elle deviendra publique avec le dépôt. À confirmer par l'humain : soit c'est voulu, soit configurer `git config user.email` sur l'adresse GitHub « noreply » ou `pro@aboudouzinsou.com` pour les prochains commits (l'historique existant ne se réécrit pas ici). Autre option, sans réécriture : publier depuis un dépôt neuf (voir plan de mise en ligne).
2. **Dossier `.claude/` suivi** (agents du projet et skills tierces avec leurs licences) et `skills-lock.json` : pas de secret, mais publics une fois le dépôt ouvert ; voir `docs-internes.md`.
3. **Contenu tiers dans `docs/providers/`** (documentation des agrégateurs, fichiers volumineux, pages HTML) : vérifier que la redistribution est autorisée par chaque agrégateur, sinon retirer le dossier et ne garder que des liens. Lié à la ligne « CGU non publiques » de `docs/plan/TACHES.md`.
4. **Noms de domaine** : `pont.aboudouzinsou.com` et `docs.pont.aboudouzinsou.com` apparaissent en clair dans la landing et le dashboard ; ils sont publics par nature, mais changeront si le nom change.
5. **Landing** : l'empreinte d'IP du limiteur de débit est calculée avec `LANDING_SECRET` ; ne jamais committer ce secret ni `.env.local` (ignorés par `.gitignore`).

## Corrections à faire

| # | Action | Qui |
|---|---|---|
| 1 | Lancer gitleaks sur tout l'historique : `gitleaks detect --source . --log-opts="--all" --redact` | HUMAIN |
| 2 | Décider de l'e-mail des commits (point 1) et configurer `git config user.email` | HUMAIN |
| 3 | Vérifier le droit de redistribuer `docs/providers/` | HUMAIN |
| 4 | (Optionnel) remplacer la valeur de développement de `prisma.config.ts:5` par une variable obligatoire | AGENT |
| 5 | Activer secret scanning + push protection sur GitHub dès la création du dépôt | HUMAIN |

Si un secret réel était trouvé plus tard dans l'historique : le révoquer chez le fournisseur **d'abord**, puis seulement réécrire l'historique (`git filter-repo`) ou repartir d'un dépôt neuf.
