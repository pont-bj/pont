# DESIGN.md — Dashboard Pont

Version 1.0 — 2026-10-27 · **v2 validée par François.** Thème clair, blanc / noir, accent indigo. **Ordinateur uniquement** (pas de version mobile). Référence de structure : shadcn/ui « Sidebar Blocks ».

## Décisions

| Date | Décision | Raison |
|---|---|---|
| 2026-10-27 | Accent indigo (le jaune de la v1 est abandonné) | Confiance, lisible sur blanc, aucun conflit avec les couleurs de statut |
| 2026-10-27 | Mise en page sobre (v2) | La v1 était trop chargée |
| 2026-10-27 | **Pas de version mobile** | Une intégration de paiement se fait concentré, sur ordinateur. Largeur cible 1280–1440 px, minimum supporté 1024 px |

## Principes UX (non négociables)

1. **Une couleur = un sens.** L'indigo est la marque, la sélection et l'action principale ; le noir le texte ; vert / rouge / ambre réservés aux statuts. Jamais de bouton vert.
2. **Sobriété.** Un écran répond à une question principale. Ce qui n'aide pas à décider tout de suite va sur sa page dédiée. Une alerte n'apparaît que s'il y a quelque chose à faire.
3. **Jamais la couleur seule.** Chaque statut = pastille + icône + libellé. Accessible aux daltoniens.
4. **Mode test toujours visible.** Pastille ambre « Mode test » dans la barre supérieure de chaque page.
5. **Argent lisible.** Chiffres tabulaires, alignés à droite, séparateur d'espace : `2 450 000 XOF`. Jamais de décimales en XOF/XAF.
6. **Ce qui demande une action d'abord.** « À réconcilier » et agrégateurs dégradés remontent en haut, avec la consigne.
7. **Secrets jamais réaffichés.** Une clé est masquée (`sk_test_••••91c0`), avec seulement « Remplacer ».
8. **Actions sensibles confirmées.** Remboursement, retrait, passage en live : confirmation explicite avec rappel du montant ; elles partent en instruction signée vers le serveur du marchand (ADR-001).
9. **Contraste AA minimum** (4,5:1 texte, 3:1 éléments d'interface). Cibles cliquables ≥ 36 px. Focus visible (anneau indigo 2 px).
10. **Français d'abord**, libellés courts et concrets (« Rembourser », pas « Initier une opération de remboursement »).

## Couleurs (tokens)

| Token | Valeur | Usage |
|---|---|---|
| `background` | `#FFFFFF` | Fond du contenu |
| `surface` | `#FAFAFA` | Sidebar |
| `surface-muted` | `#F4F4F5` | Champ de recherche, survol, statuts neutres |
| `border` | `#EDEDF0` | Bordures, séparateurs |
| `border-subtle` | `#F4F4F5` | Séparateurs de lignes de tableau |
| `foreground` | `#09090B` | Texte principal |
| `muted-foreground` | `#71717A` | Texte secondaire (4,8:1) |
| `faint-foreground` | `#A1A1AA` | Métadonnées non essentielles (dates, sous-titres) — jamais pour une information nécessaire |
| `accent` | `#4F46E5` | Marque, bouton principal (texte blanc, 6,3:1), donnée mise en avant |
| `accent-strong` | `#3730A3` / `#4338CA` | Texte et icône de l'élément actif, liens |
| `accent-soft` | `#EEF2FF` / `#E0E7FF` | Fond de l'élément actif, données secondaires des graphiques |
| `success` | `#15803D` / fond `#F0FDF4` | Réussi, Opérationnel |
| `danger` | `#B91C1C` / fond `#FEF2F2` | Échoué, Erreur |
| `warning` | `#B45309` / fond `#FFFBEB`, bordure `#FDE68A` | À réconcilier, Dégradé, Mode test |
| `neutral` | `#52525B` / fond `#F4F4F5` | En attente, En cours, Annulé, Expiré, Non connecté |

## Typographie

Inter. Chiffres tabulaires pour tous les montants.

| Rôle | Taille / graisse |
|---|---|
| Titre de page | 22 / SemiBold |
| Montant principal (détail) | 32 / SemiBold |
| Indicateur | 28 / SemiBold |
| Titre de carte | 14 / Medium |
| Corps, cellule principale | 14 / Regular–Medium |
| Libellé, cellule secondaire | 13 / Regular |
| Badge, métadonnée | 12 / Medium–Regular |

## Mise en page

- Cadre de référence : 1440 × 960. Sidebar 224 px. Contenu : marges 40 px, espacement vertical 24 px.
- Barre supérieure 60 px : recherche (360 px) à gauche, « Mode test » à droite.
- Rayons : 8 (contrôles), 999 (badges), 10–12 (cartes). Bordures seules, pas d'ombre sur les cartes.
- Espacements : 4, 8, 12, 16, 24, 32, 40.

## Composants de statut

| Statut Pont | Libellé | Couleur | Icône |
|---|---|---|---|
| `succeeded` | Réussi | success | check |
| `pending` / `processing` | En attente / En cours | neutral | cercle |
| `failed` | Échoué | danger | croix |
| `expired` / `cancelled` | Expiré / Annulé | neutral | tiret |
| `refunded` / `partially_refunded` | Remboursé / Remb. partiel | neutral | flèche retour |
| `needsReconciliation` | À réconcilier | warning | triangle |

## Navigation

5 entrées, sans titres de groupe :
- Vue d'ensemble · Paiements (inclut les remboursements) · Retraits · Agrégateurs (inclut couverture et santé) · Développeurs (clés API, webhooks, journaux)
- Pied : Paramètres · compte utilisateur

## Écrans

| # | Écran | Fichier | Statut |
|---|---|---|---|
| 1 | Vue d'ensemble | `maquettes/01-vue-ensemble-desktop-v2.png` | ✅ validé (2026-10-27) |
| 2 | Paiements — liste | `maquettes/02-paiements.png` | ✅ validé (2026-10-27) |
| 3 | Paiement — détail et chronologie | `maquettes/03-paiement-detail.png` | ✅ validé (2026-10-27) |
| 4 | Retraits | `maquettes/04-retraits.png` | ✅ validé (2026-10-27) |
| 5 | Agrégateurs (connexions, santé, couverture) | `maquettes/05-agregateurs.png` | ✅ validé (2026-10-27) |
| 6 | Développeurs — Intégration (commande, agent IA, clés, webhook) | `maquettes/06-developpeurs.png` | ✅ validé (2026-10-27) |
| 7 | Développeurs — Cas d'usage (recettes du framework, ADR-003) | `maquettes/07-cas-usage.png` | ✅ validé (2026-10-27) |

Historique : v1 de la vue d'ensemble (`01-vue-ensemble-desktop-v1.png`) refusée (jaune, trop chargée).

Note Lunacy : le service d'icônes (Icons8) charge de façon asynchrone et peut échouer ; les icônes sont dessinées en formes simples (style Lucide, trait 1,5 px). Dans le code : `lucide-react`.
