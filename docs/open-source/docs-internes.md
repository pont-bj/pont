# Docs internes : quoi garder public, quoi retirer

Aucun fichier n'est supprimé ici : ce sont des recommandations pour la mise en public. Légende : GARDER, ALLÉGER (garder après retrait de passages précis), RETIRER (sortir du dépôt public avant l'ouverture, via un dépôt neuf ou un commit de retrait).

## Décisions

| Élément | Décision | Justification |
|---|---|---|
| `CLAUDE.md` | ALLÉGER (fait en partie) | Fichier de contexte pour agents IA ; utile aux contributeurs qui utilisent Claude Code (règles de code, structure). La référence à `~/Brain` (note personnelle, chemin local) est supprimée. Il reste des références à la logique interne (« Pont Cloud payant », « clés conservées »), sans danger. Une version publique est proposée dans `CLAUDE.public.md` : à substituer si tu préfères un fichier plus neutre. |
| `docs/plan/TACHES.md` | GARDER (option : ALLÉGER) | Backlog factuel, montre la progression et l'honnêteté du projet. Retirer les mentions « agent », qui n'apportent rien au public. |
| `docs/plan/deploiement-cloud-selfhost.md` | GARDER | Décisions self-host / Cloud et traitement des clés : renforce la confiance (transparence sur le chiffrement). Statut « rien n'est implémenté » est honnête. Vérifier qu'aucun tarif n'y figure (aucun relevé). |
| `docs/plan/demo.md` et `demo-storyboard.webp` | RETIRER | Script vidéo de promotion et storyboard : matériel marketing interne, aucun intérêt pour les contributeurs, mentionne des plans d'annonce. |
| `docs/legal/CGU-brouillon.md` | RETIRER jusqu'à validation du juriste | Brouillon non validé : le publier peut être pris pour des conditions réelles ou engager. À republier (`docs/legal/`) une fois relu. Garder `CLA.md`, `TRADEMARK.md` (déjà racine, validation juridique à faire). |
| `docs/design/` (DESIGN.md, maquettes, marque, assets agrégateurs) | ALLÉGER | `DESIGN.md` garder (utile pour contribuer au dashboard). Les maquettes sont lourdes (jusqu'à 584 Ko l'image) : garder au plus quelques-unes, ou les sortir du dépôt (gonflement permanent de l'historique). `marque/` : logos du projet, à garder sous réserve du renommage. `assets/agregateurs` : logos de marques tierces, vérifier le droit d'usage ; sinon retirer. |
| `docs/CAHIER-DES-CHARGES.md` | ALLÉGER | Contient le positionnement tarifaire (« high ticket »), la grille de plans (l. ~369-373) et la concurrence (l. ~406). Retirer ces sections (stratégie commerciale) ou publier une version « spécification technique » sans elles. |
| `docs/metier/` | GARDER | Règles métier, décisions (ADR), fidélité à la documentation : cœur de la transparence. |
| `docs/providers/` | À VÉRIFIER | Documentation tierce copiée (très volumineuse). Garder seulement si la redistribution est permise ; sinon liens. |
| `.claude/agents/`, `.claude/skills/` | ALLÉGER | Skills tierces avec leurs licences (MIT/Apache) : redistribuables mais sans valeur pour le public et bruyantes. Recommandé : ne pas les publier (ajouter `.claude/` au `.gitignore` et les retirer de l'index), ou garder uniquement les agents du projet si tu veux montrer le workflow. |
| `skills-lock.json` | RETIRER | Verrou de skills de ton poste, dépend de `.claude/skills/`. |
| `docs/open-source/` (checklist, audit, plan de mise en ligne) | GARDER l'essentiel | La checklist et la publication npm sont utiles. `plan-mise-en-ligne.md` et `audit-secrets.md` sont internes (stratégie de lancement) : les retirer du dépôt public après usage, ou les garder si tu assumes la transparence. |

## Version publique proposée de `CLAUDE.md`

Voir `docs/open-source/CLAUDE.public.md`. Elle conserve la structure et les règles de code, retire toute référence à des notes ou chemins personnels, et précise le statut du projet. Pour l'adopter : `cp docs/open-source/CLAUDE.public.md CLAUDE.md` (action HUMAINE, non faite ici).

## Procédure pour retirer sans fuite d'historique

Un fichier retiré par un simple commit reste lisible dans l'historique. Pour les éléments « RETIRER », la solution propre est de **publier depuis un dépôt neuf** (sans historique) ou de réécrire l'historique (`git filter-repo`) avant le premier push public. Détails dans `plan-mise-en-ligne.md`.
