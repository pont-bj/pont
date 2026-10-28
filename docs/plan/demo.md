# Démo Pont : script vidéo

**Slogan :** Pont, le backend de ta fintech en un clic.

Format : 16:9 (1920×1080), 51,5 s. Storyboard : `demo-storyboard.webp` (Lunacy, y = 12 700).
Style : fond sombre, accents indigo `#4F46E5` / `#6366F1`, typographie Outfit animée mot par mot, reveals doux (inspiration Rerun), produit réel incliné en 3D (inspiration CarPulse).

## Fil narratif

Problème (trop de documentation, trop de risques), puis Pont, puis preuve, puis appel à l'action. Les croix rouges de l'intro reviennent en coches vertes au plan 6.

| # | Temps | Voix off | Image | Source |
|---|---|---|---|---|
| 1 | 0–6 s | « Tu lances ta fintech et tu dois intégrer FedaPay, PawaPay, PayDunya, Kkiapay… » | Une pluie de logos d'agrégateurs et d'opérateurs envahit l'écran (CinetPay, Paystack, Flutterwave, Moneroo, Wave, MTN MoMo, Orange Money, Moov Money…) ; les quatre pris en charge par Pont s'allument au moment où la voix les cite | Logos `public/agregateurs/` + logos à collecter |
| 2 | 6–12 s | « Trois agrégateurs, trois documentations différentes. Trois fois plus de chances de te planter. » | Trois piles de documentation qui s'empilent et débordent ; sous chaque logo, « API », « webhooks », « statuts » barrés d'une croix rouge ; un compteur « ×3 » | À créer |
| 3 | 12–16 s | « Voici Pont. » | Le pont brisé qui se rejoint, le badge P qui tombe en clé de voûte | Composant `PontRecit` |
| 4 | 16–21 s | « Le backend de ta fintech, en un clic. » | Le slogan mot par mot, puis les briques du backend qui s'assemblent sous le pont : paiements, retraits, registre, portefeuilles, plafonds KYC, webhooks | À créer |
| 5 | 21–27 s | « Une commande… » | Terminal : `npx pont init`, les fichiers apparaissent, « ✓ Premier paiement test réussi en 41 s » | Composant `TerminalAnime` |
| 6 | 27–33 s | « …ou demande à ton agent IA. » | Chat avec l'agent : « Ajoute un portefeuille à mon appli », puis « ✓ Recette Portefeuille installée » | À créer |
| 7 | 33–39 s | « Tous tes agrégateurs. Une seule API. » | Hub : le P au centre, relié par des lignes lumineuses aux quatre agrégateurs, puis aux drapeaux ; les croix rouges du plan 2 deviennent des coches vertes | À créer |
| 8 | 39–44 s | « Portefeuille mobile, tontine, marketplace, microcrédit… Décris ta fintech, Pont installe le reste. » | Les cartes de cas d'usage arrivent en cascade ; le Portefeuille s'ouvre sur le dashboard vivant incliné en 3D (une ligne passe de « Vérification… » à « Réussi ») | Composant `DashboardVivant` + cartes cas d'usage |
| 9 | 44–50 s | « Pont. Le backend de ta fintech en un clic. Rejoins la liste d'attente. » | Logotype, slogan, `pont.aboudouzinsou.com`, bouton « Rejoindre la liste » | Kit `docs/design/marque/` |

## Règles de contenu

- La voix off ne cite que les agrégateurs pris en charge par Pont : FedaPay, PawaPay, PayDunya, Kkiapay.
- Les autres logos n'apparaissent qu'au plan 1, pour illustrer la quantité d'intégrations possibles ; ils ne reviennent jamais dans les plans « solution » (hub, dashboard), pour ne pas laisser croire qu'ils sont pris en charge.

## Règles de montage

- Une phrase par plan, de 1,5 à 3 s ; mots-clés en grand (« ×3 », « un clic », « 0 clé »).
- Transitions : flou qui se dissipe et montée douce, jamais de coupe sèche sur le logo.
- Sous-titres via le workflow EffectCraft (mots-clés en indigo).
- Musique : montée progressive jusqu'au plan 3, ouverture au moment où le pont se rejoint.
- Liens trackés : `?utm_source=tiktok`, `?utm_source=linkedin`.

## À produire

- [ ] Plan 2 : piles de documentation et croix rouges
- [ ] Plan 4 : assemblage des briques du backend
- [ ] Plan 6 : chat avec l'agent IA
- [ ] Plan 7 : hub d'intégrations avec lignes lumineuses
- [ ] Enregistrement de la voix off (français)
- [ ] Montage et sous-titres
