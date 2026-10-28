# Licences des dépendances de production

> Inventaire généré le 2026-10-28 à partir de `pnpm ls -r --prod --depth Infinity` et du champ `license` des `package.json` présents dans `node_modules/.pnpm` (aucune installation lancée). **Non juridique** : à revérifier avant publication et à chaque mise à jour du `pnpm-lock.yaml`. Les licences sont celles déclarées par les paquets, non vérifiées dans leurs fichiers LICENSE.

## Résumé (paquets uniques nom@version, hors paquets du dépôt)

| Licence déclarée | Nombre |
|---|---|
| MIT | 667 |
| ISC | 57 |
| Apache-2.0 | 42 |
| BSD-3-Clause | 15 |
| BSD-2-Clause | 4 |
| MPL-2.0 | 3 |
| LGPL-3.0-or-later | 2 |
| EPL-2.0 | 2 |
| Unlicense | 2 |
| 0BSD, MIT-0, OFL-1.1, CC-BY-4.0, « MIT and ISC », (MIT OR CC0-1.0), (MPL-2.0 OR Apache-2.0) | 1 chacune |
| Inconnue / non lisible | 153 (voir ci-dessous) |

Les licences permissives (MIT, ISC, BSD, Apache-2.0, 0BSD, MIT-0, Unlicense) demandent surtout de conserver les mentions de copyright et de licence.

## À examiner

| Paquet exact | Licence | Utilisé via | Remarque |
|---|---|---|---|
| `@img/sharp-libvips-linux-x64@1.3.4`, `@img/sharp-libvips-linuxmusl-x64@1.3.4` | **LGPL-3.0-or-later** | `next` (sharp), `fumadocs-*`, `better-auth` ; applications `dashboard`, `docs`, `landing` | Bibliothèque native liée dynamiquement, non modifiée : usage courant. Si l'image Docker redistribue ces binaires, joindre le texte LGPL et la mention de l'origine du code source. Les variantes d'autres plateformes (`@img/sharp-libvips-*`) ont la même licence. |
| `lightningcss@1.32.0`, `lightningcss-linux-x64-gnu@1.32.0`, `lightningcss-linux-x64-musl@1.32.0` | **MPL-2.0** | `better-auth` (dashboard) | Copyleft au niveau du fichier : sans effet si non modifié. |
| `dompurify@3.4.17` | (MPL-2.0 OR Apache-2.0) | `mermaid` (docs) | Choisir Apache-2.0. |
| `elkjs@0.11.1`, `elkjs@0.9.3` | **EPL-2.0** | `mermaid` (docs) ; `@prisma/client` (server, store-prisma) | Copyleft faible, non modifié. Vérifier si présent dans l'artefact distribué du serveur. |
| `caniuse-lite@1.0.30001819` | **CC-BY-4.0** | `next`, `fumadocs-*` | Données ; attribution requise si redistribuées. |
| `@fontsource-variable/inter@5.3.0` | **OFL-1.1** | dashboard | Police ; conserver la licence OFL avec les fichiers de police. |
| `khroma@2.1.0` | **Inconnue** (champ `license` absent) | `mermaid` (docs) | À vérifier dans le dépôt amont du paquet. |
| `@visx/vendor@4.0.0-alpha.0` | « MIT and ISC » | `@prisma/client` (chaîne) | Expression non SPDX valide : vérifier. |

## Licence inconnue : paquets natifs non installés

152 des 153 « inconnues » sont des binaires optionnels propres à d'autres plateformes, absents de ce poste (donc `package.json` illisible) : `@esbuild/*` (0.21.5, 0.27.0, 0.28.2), `@rollup/rollup-*` (4.65.1), `@next/swc-*` (15.5.28, 16.4.3), `@img/sharp-*` (0.35.5) et `@img/sharp-libvips-*` (1.3.4), `@napi-rs/lzma-linux-x64-gnu@1.5.1`, `@emnapi/runtime@1.11.3`, `@yuku-core/binding-*@0.17.0`, etc. Leur licence est en général celle du paquet parent (MIT, Apache-2.0 ; les `libvips` en LGPL-3.0-or-later). À confirmer avec un outil de licences (par exemple `pnpm licenses list --prod`) après une installation complète.

## Compatibilité avec la Change License

Après conversion, la licence de Pont sera l'AGPL-3.0-only. Les dépendances ci-dessus (permissives, MPL-2.0, LGPL-3.0, EPL-2.0 non modifiées et non fusionnées) restent des composants séparés avec leur propre licence. EPL-2.0 est le point à faire vérifier par un juriste en cas de redistribution groupée avec du code AGPL.
