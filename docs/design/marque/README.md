# Identité Pont

Symbole : un P dont l'œil est une arche de pont. Logotype : le symbole remplace le P, suivi de « ont » en Outfit SemiBold (texte vectorisé, aucune police requise).

| Couleur | Hex | Usage |
|---|---|---|
| Indigo | `#4F46E5` | Symbole sur fond clair, fonds de marque |
| Indigo clair | `#6366F1` | Symbole sur fond sombre |
| Noir | `#09090B` | Texte, fonds sombres |
| Blanc | `#FFFFFF` | Sur indigo ou noir |

## Contenu

- `01-symbole/` : symbole seul (indigo, indigo clair, noir, blanc) : SVG, PDF, PNG @4x/@10x/@20x.
- `02-logotype/` : P + ont (clair, sombre, mono noir, mono blanc, indigo) : SVG, PDF, PNG @1x/@2x/@4x.
- `03-icone/` : icône d'appli, `favicon.ico` (16/32/48), `apple-touch-icon.png` (180), `tailles/` de 16 à 1024 px, versions carrée et sombre.
- `04-reseaux/` : post LinkedIn 4:5, story TikTok 9:16, carré Instagram, Open Graph 1200×630, bannière LinkedIn, photo de profil.

## Règles

- Marge de protection autour du logo : au moins la largeur du fût du P.
- Taille minimale du symbole : 16 px (favicon) ; du logotype : 80 px de large.
- Ne pas déformer, recolorer hors palette, ni ajouter d'ombre.

Régénérer : `python3 build.py <dossier>` (VectorCraft CLI requis), script dans `docs/design/marque/build.py`.
