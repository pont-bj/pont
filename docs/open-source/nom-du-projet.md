# Choisir le nom du projet

Date des vérifications : 2026-10-28. Ce document n'est pas un avis juridique. Aucune disponibilité de marque n'est affirmée ici : seul un dépôt/recherche officielle (OAPI pour l'espace africain francophone) par un professionnel de la propriété intellectuelle peut la confirmer.

## 1. État réel de « Pont »

| Vérification | Résultat | Source |
|---|---|---|
| npm `pont` | Pris (v0.0.0, « bridge for remote management of objects/functions ») | `npm view pont` |
| npm `pont-cli` | Pris (v0.3.4, « Pont CLI ») | `npm view pont-cli` |
| npm `@pont-bj/*` | `npm view @pont-bj/anything` renvoie 404, ce qui ne prouve pas que le scope soit libre (un scope peut exister sans ce paquet). La page `npmjs.com/~pont` répond 403 (anti-bot), non exploitable. À vérifier à la main sur npmjs.com | npm, curl |
| GitHub `pont` | Compte utilisateur existant (1 dépôt public). L'organisation/le nom est donc pris | `gh api users/pont` |
| Dépôts « Pont » paiement | Aucun dépôt populaire trouvé (résultats voisins à 0-1 étoile : Pontswap, pontmore...) | `gh search repos` |
| Domaines | `pont.com` (DNS GoDaddy) pris ; `pont.dev` (OVH) pris ; `getpont.com` et `usepont.com` pris ; `pont.io`, `pont.africa`, `pont.bj` : pas de NS visible, **incertain** (un domaine .io/.bj peut être enregistré sans délégation ; whois absent de la machine) | `dig NS` |
| Web | Aucune entreprise « Pont » évidente en mobile money africain dans une recherche rapide, mais la recherche web est limitée (US) et superficielle | WebSearch |

Verdict franc : « Pont » est un mot français courant, très repris dans d'autres secteurs et dans les noms de produits fintech en général. Les paquets npm, le nom GitHub et les domaines principaux sont déjà occupés, donc on ne peut pas avoir une identité cohérente (paquet, organisation, domaine) sous ce nom. Le risque de conflit de marque est élevé pour un terme aussi générique et descriptif (difficile à protéger en tant que marque, et probablement déjà enregistré dans certaines classes). Je ne conclus pas juridiquement : une recherche d'antériorité professionnelle est nécessaire.

## 2. Alternatives testées

Légende : npm = `npm view <nom>` (404 = libre) ; GH = `gh api users/<nom>` ; domaines = `dig NS` (vide = pas de délégation visible, donc « incertain », jamais « libre » certifié). Les scopes `@<nom>` n'ont été testés que via `@<nom>/core` (404 non concluant).

| Nom | npm | GitHub | .com | .dev | .io | .africa | .bj | Remarque |
|---|---|---|---|---|---|---|---|---|
| Ponto | pris | libre (404) | pris | incertain | pris | incertain | incertain | Fintech belge Ponto existe (connaissance générale, non revérifié) : à éviter |
| Pontis | pris | pris (0 dépôt) | pris | pris | pris | incertain | incertain | Écarter |
| Arkea | libre | pris (24 dépôts) | pris | incertain | pris | incertain | incertain | Arkéa est une banque française : conflit probable, écarter |
| **Passa** | libre | pris (0 dépôt, compte dormant) | incertain | incertain | pris | incertain | incertain | « Passer/passage » ; court, prononçable ; web : pas de Passa fintech trouvé (recherche rapide) |
| Tramo | pris | pris | pris | pris | pris | incertain | incertain | Écarter |
| Relia | pris | pris | pris | pris | pris | incertain | incertain | Écarter |
| Nexal | pris | pris | pris | incertain | pris | incertain | incertain | Écarter |
| **Jonxa** | libre | pris (8 dépôts) | pris | incertain | incertain | incertain | incertain | Jonction ; inventé, distinctif ; sonorité moins naturelle |
| **Traversa** | libre | libre (404) | pris | pris | pris | incertain | incertain | Traversée ; long, ressemble à du latin/italien |
| **Gbeto** | libre | pris (1 dépôt) | pris | incertain | incertain | incertain | incertain | Inspiré du fon, sens à faire valider par des locuteurs avant tout usage ; ne pas présumer de l'étymologie |
| Ouvra | libre | pris (1 dépôt) | pris | incertain | incertain | incertain | incertain | « Ouvrir » ; npm libre, .com pris |
| Tisse | libre | pris (7 dépôts) | pris | incertain | incertain | incertain | incertain | « Tisser » (trame, lien) ; mot très courant, risque de marque descriptive |

Constat : presque tous les noms courts sont pris sur .com/.io. Les .dev et .africa semblent plus accessibles, mais c'est une impression issue de `dig` seulement.

## 3. Top 3 (sous réserve de vérification officielle)

1. **Passa** : court, deux syllabes ouvertes faciles en français et dans les langues du golfe de Guinée, évoque le passage et le franchissement (même champ que le pont), paquet npm libre, aucun acteur fintech évident trouvé. Faiblesse : mot proche de « pass » (nombreux noms voisins dans le paiement) et .com non visiblement délégué mais à confirmer.
2. **Traversa** : GitHub et npm libres, forte image de traversée, conserve l'esprit « pont ». Faiblesse : long, domaines .com/.dev/.io pris.
3. **Jonxa** : distinctif donc plus facile à protéger, npm libre. Faiblesse : prononciation moins évidente, nom inventé sans histoire, compte GitHub pris.

Aucun de ces trois n'est garanti libre en tant que marque. Faire une recherche d'antériorité OAPI (classes 9, 36, 42) et un contrôle INPI/EUIPO/USPTO par un conseil en propriété industrielle avant tout dépôt ou investissement dans le logo.

## 4. Coût d'un renommage dans ce dépôt

Occurrences insensibles à la casse de « pont » dans les fichiers suivis par git (636 fichiers suivis au total ; les catégories se recoupent un peu) :

| Catégorie | Occurrences | Fichiers |
|---|---|---|
| Packages, SDK, plugins, starters (`packages`, `sdks`, `plugins`, `starters`) | environ 1 460 | 114 |
| Apps (dashboard, docs, landing) | environ 580 | 96 |
| Docs et fichiers racine `*.md` | environ 400 | 58 |
| Docker / déploiement (`deploy/`) | environ 150 | 8 |
| Imports `@pont-bj/...` | 390 occurrences, 23 noms de paquets distincts | transversal |
| Total | environ 2 170 | |

Autres coûts : 91 fichiers dont le nom contient « pont » (logo, symboles, dossier de marque), la CLI `pont` (commande, binaire), `definePont`, `docs.pont.aboudouzinsou...` (domaines/URL), variables d'environnement et images Docker, `TRADEMARK.md`, le logo (le symbole est un P-pont : il ne fonctionne qu'avec un nom en P), le slogan, et les textes de landing. Techniquement faisable par recherche/remplacement scripté, avec revue manuelle (le mot français « pont » peut apparaître dans la prose).

## 5. Approche proposée

Option A (recommandée à court terme, faible coût) : garder « Pont » comme nom d'usage et slogan, publier sous un nom de paquet et d'organisation distinct (scope npm et organisation GitHub nouveaux, CLI nommée autrement). Avantage : identité visuelle conservée, pas de gros renommage. Inconvénient : deux noms à expliquer, et le risque de marque sur « Pont » reste entier.

Option B (plus propre si le projet vise une marque protégée) : renommage complet après recherche OAPI sur le nom retenu, avant la première publication npm publique, car renommer après publication coûte beaucoup plus cher (paquets déjà installés, dépréciations npm). Prévoir le logo.

Recommandation : trancher avant toute publication ; si l'objectif est une marque défendable (le dépôt prévoit déjà `TRADEMARK.md`), choisir B avec un nom plus distinctif que « Pont », une fois la recherche d'antériorité faite.
