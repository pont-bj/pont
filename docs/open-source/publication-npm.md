# Publication npm

Rien n'est publié à ce jour. Ce document décrit comment préparer et publier les paquets, sans rien faire par accident.

## 1. État des paquets

Source unique des métadonnées : `scripts/publish-meta.json` (scope, version, licence, auteur, dépôt, mots-clés, liste des paquets privés). Pour les réappliquer à tous les `packages/**/package.json` : `node scripts/apply-publish-meta.mjs` (idempotent).

| Paquet | Publié ? | Remarque |
|---|---|---|
| `@pont-bj/core`, `framework`, `engine`, `sandbox`, `ledger`, `recipes`, `auth` | oui | bibliothèques |
| `@pont-bj/adapter-fedapay`, `-pawapay`, `-paydunya`, `-kkiapay`, `-cinetpay` | oui | un par agrégateur |
| `@pont-bj/node` | oui | SDK |
| `@pont-bj/store-convex`, `@pont-bj/store-prisma` | oui | stockage |
| `@pont-bj/cli` (binaire `pont`), `@pont-bj/mcp` (binaire `pont-mcp`) | oui | outils |
| `@pont-bj/server` | non (`private: true`) | distribué par Docker / `deploy/self-host`, son `bin` pointe encore vers `src/` |
| `apps/*` | non (`private: true`) | applications |
| `packages/react` | non | dossier vide (pas de `package.json`), prévu « bientôt » |

Toutes les versions sont à `0.1.0`. En `0.x`, tout peut changer : l'annoncer dans les README (c'est fait).

## 2. Comment le contenu publié est construit

Chaque paquet garde `main`/`exports` vers `src/` pour le développement dans le monorepo, et un bloc `publishConfig` (`main`, `types`, `exports`, `bin`) qui pointe vers `dist/`. **Seuls `pnpm pack` et `pnpm publish` appliquent `publishConfig` et remplacent `workspace:*` par la vraie version.** Ne jamais utiliser `npm publish` ni `npm pack` pour juger du résultat : ils publieraient des `exports` vers `src/` inexistant.

Vérification faite (28 octobre 2026) : `pnpm -r build` passe ; `pnpm pack` de chacun des 17 paquets ne contient que `package.json`, `README.md`, `LICENSE`, `dist/` (et `convex/` pour `store-convex`, `prisma/schema.prisma` pour `store-prisma`). Aucun test, aucun `.env`, aucun `.map`, aucune référence `workspace:`, aucun chemin personnel.

Refaire la vérification avant chaque publication :

```bash
pnpm install --frozen-lockfile && pnpm -r typecheck && pnpm -r build
mkdir -p /tmp/tgz && pnpm -r exec pnpm pack --pack-destination /tmp/tgz
for t in /tmp/tgz/*.tgz; do echo "== $t"; tar tzf "$t" | grep -v '/dist/'; done
```

Alternative sans écriture : `pnpm -r publish --dry-run --no-git-checks`.

## 3. Avant la première publication (HUMAIN)

1. **Nom définitif.** `pont` et `pont-cli` existent déjà sur npm (hors scope, donc sans impact direct sur `@pont-bj/*`, mais source de confusion et de risque de marque). Le nom est un nom de code : décider avant de publier, car un paquet publié ne se renomme pas (on ne peut que le déprécier).
2. **Propriété du scope.** `@pont` n'est pas publié mais sa propriété n'est pas vérifiée. Vérifier :
   ```bash
   npm view @pont-bj/core            # 404 attendu tant que rien n'est publié
   npm org ls pont 2>&1 | head    # échoue si tu n'es pas membre
   ```
   puis créer l'organisation sur https://www.npmjs.com/org/create (le nom d'organisation = le scope). Si `pont` est déjà pris, on ne peut pas publier sous `@pont` : appliquer la procédure de renommage (section 5) avant tout.
3. **2FA.** Activer la 2FA sur le compte npm (mode « autorisation et publication »), l'exiger pour l'organisation (Settings > Require two-factor authentication).
4. **Jeton d'automatisation.** Créer un jeton granulaire (Access Tokens > Generate New Token > Granular) : droit « Read and write » limité au scope de l'organisation, expiration courte (90 jours), puis l'enregistrer dans GitHub : Settings > Secrets and variables > Actions > `NPM_TOKEN`. Ne jamais le copier dans un fichier, un message ou une issue.
5. **Environnement GitHub.** Créer l'environnement `npm-publication` (Settings > Environments) avec validation obligatoire par toi : le workflow ne part pas sans ton clic.
6. Fichier `LICENSE` à la racine (présent) : `pnpm pack` le copie dans chaque paquet.

## 4. Ordre de publication

`pnpm -r publish` respecte l'ordre topologique des dépendances. À titre indicatif :

1. `@pont-bj/core`
2. `@pont-bj/framework`, `@pont-bj/sandbox`, `@pont-bj/auth`
3. `@pont-bj/engine`, `@pont-bj/ledger`
4. `@pont-bj/adapter-*` (5 paquets), `@pont-bj/recipes`
5. `@pont-bj/store-convex`, `@pont-bj/store-prisma`
6. `@pont-bj/node`
7. `@pont-bj/cli`, puis `@pont-bj/mcp`

Premier essai conseillé : lancer le workflow à la main avec `simulation = true` (par défaut). Publication réelle : pousser un tag `vX.Y.Z` (après l'accord humain) ou relancer le workflow avec `simulation = false`.

Le script racine `release` (`changeset publish`) ne fonctionne pas : `@changesets/cli` n'est pas installé et il n'y a pas de dossier `.changeset`. Il est à supprimer ou à remplacer par le workflow (non modifié ici pour ne pas toucher au `package.json` racine).

## 5. Procédure de renommage

Le nom n'apparaît à deux endroits distincts :

- **Le scope npm** (`@pont-bj/…`), centralisé : `scripts/publish-meta.json` (clé `scope`) et le script de renommage.
- **Les binaires** `pont`, `pont-mcp`, `pont-server` et les mentions « Pont » dans les textes : à changer à la main (voir ci-dessous).

Étapes :

```bash
# 1. Simulation puis application (fichiers suivis par git, hors pnpm-lock.yaml, docs/providers et .claude/skills)
node scripts/rename-scope.mjs @pont @nouveau-scope --dry
node scripts/rename-scope.mjs @pont @nouveau-scope
# 2. Mettre à jour "scope" dans scripts/publish-meta.json et, si le dépôt change, repoUrl/homepage/bugs
# 3. Réappliquer les métadonnées, régénérer le verrou, vérifier
node scripts/apply-publish-meta.mjs
pnpm install && pnpm -r typecheck && pnpm -r build
# 4. Chercher les restes
git grep -nIi "pont" -- ':!pnpm-lock.yaml' ':!docs/providers' ':!.claude/skills' | less
```

À renommer à la main : `bin` de `packages/cli`, `packages/mcp`, `packages/server` (clés `pont`, `pont-mcp`, `pont-server`), variables `PONT_*` (cela casse les installations existantes : décider si on les garde), `deploy/self-host`, textes du README, de la landing, de la doc, `TRADEMARK.md`, `docs/design/marque/`, domaines (`pont.aboudouzinsou.com`, `docs.pont…`). Renommer **avant** la première publication : après, il faudra publier de nouveaux paquets et déprécier les anciens (`npm deprecate`).

## 6. Provenance (`--provenance`)

La provenance prouve, via une attestation signée (Sigstore), que le paquet a été construit par CE workflow GitHub à partir de CE commit. Conditions :

- publier depuis GitHub Actions (pas depuis ton poste) avec `permissions: id-token: write` : c'est le cas dans `.github/workflows/release.yml` ;
- `NPM_CONFIG_PROVENANCE=true` (équivalent de `--provenance`) : positionné dans le workflow ;
- le champ `repository.url` de chaque `package.json` doit correspondre au dépôt qui publie, et le dépôt doit être **public** (la provenance échoue depuis un dépôt privé) : c'est une raison de plus de renseigner `repository` exactement, et de ne publier qu'après la mise en public.

Vérification après publication : la page npm du paquet affiche « Built and signed on GitHub Actions » ; ou `npm audit signatures` dans un projet qui l'installe.

## 7. Après la publication

- Tester l'installation dans un projet vierge (`pnpm add @pont-bj/node`), et `npx @pont-bj/cli --help`.
- En cas d'erreur : `npm unpublish` n'est possible que dans les 72 h et sous conditions ; préférer `npm deprecate` puis une version corrective.
- Si le jeton a fuité : le révoquer immédiatement sur npmjs.com, puis en recréer un.
