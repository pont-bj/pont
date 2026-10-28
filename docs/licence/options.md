# Pont : options de licence

> **AVERTISSEMENT. Je ne suis pas juriste.** Ce document est une aide à la décision, rédigée par une IA à partir de textes officiels consultés en ligne (URL en annexe). Il ne constitue pas un avis juridique. **Un juriste (droit béninois / OHADA, et idéalement un spécialiste de la propriété intellectuelle et des licences logicielles) doit valider le texte final de la licence, du CLA et de tout contrat de partage de revenus avant toute publication.** Les brouillons de clauses ci-dessous sont des propositions de travail, non des textes prêts à l'emploi. Les points non vérifiés sont signalés « à vérifier ».

Date de rédaction : 2026-10-28. Aucun fichier `LICENSE` n'est créé par ce document.

---

## 1. Clarification essentielle : « open source » ou « source disponible » ?

### Ce que veut dire « open source »

La *Open Source Definition* de l'OSI (https://opensource.org/osd) impose notamment :

- **Critère 1, redistribution libre** : la licence ne peut pas empêcher de vendre ou donner le logiciel, ni exiger de redevance pour cette vente.
- **Critère 5, pas de discrimination contre des personnes ou groupes**.
- **Critère 6, pas de discrimination contre des domaines d'activité** : la licence ne peut pas interdire l'usage dans un domaine précis. La page cite elle-même l'exemple de l'usage commercial.

### Conséquence pour tes exigences

| Exigence | Compatible OSI ? |
|---|---|
| (a) Code consultable, auditable, auto-hébergeable | Oui |
| (b) Le projet reste ta propriété | Oui (tu gardes le droit d'auteur dans tous les cas, la licence n'est qu'une autorisation) |
| (c) Interdire revente, hébergement concurrent, revenu sans rien te devoir | **Non** (critères 1, 5, 6) |
| (d) Reversement d'une partie du revenu | **Non** |
| (e) Contributions externes | Oui (avec un CLA) |

**Les exigences (c) et (d) sont incompatibles avec une licence open source au sens de l'OSI.** Dès que tu restreins l'usage commercial ou l'offre de service hébergé, le projet n'est plus « open source » au sens strict.

### Vocabulaire à utiliser

- Dire **« source disponible »** (*source-available*) ou **« Fair Source »**. Le site https://fair.io/about/ définit un logiciel Fair Source comme : publiquement lisible ; utilisable, modifiable et redistribuable avec des restrictions minimales destinées à protéger le modèle économique du producteur ; soumis à une **publication open source différée** (*delayed open source publication*).
- Ne pas écrire « open source » dans le README, le site ou la communication. Le terme n'est pas une marque déposée au sens strict, mais les communautés développeurs réagissent mal à l'usage abusif (« open-washing »). Le risque est réputationnel : critiques publiques, perte de confiance de la communauté technique, et pour une fintech, perte de crédibilité sur la transparence.
- Le README actuel dit « code publié, self-host gratuit à vie » : c'est exact et à conserver. Il faudra préciser « source disponible » et le périmètre exact de « gratuit ».
- La page de la BSL (https://mariadb.com/bsl11/) dit elle-même que la licence « is not an Open Source license ». La Commons Clause (https://commonsclause.com/) recommande de ne pas appeler le logiciel « open source ».

---

## 2. Tableau comparatif

Légende protection : forte / moyenne / faible / nulle. « Revenu partagé » = possibilité d'imposer un partage de revenu *par la licence elle-même*.

| Option | Texte officiel | Permis / interdit (résumé) | Concurrent hébergé | Revente | Revenu partagé | Contributions externes | Conversion auto | Maturité / risques |
|---|---|---|---|---|---|---|---|---|
| **BUSL 1.1** (avec *Additional Use Grant*) | https://mariadb.com/bsl11/ | Copie, modification, redistribution et usage **non production** permis. L'usage en production exige une licence commerciale, sauf ce que l'« Additional Use Grant » autorise. | **Forte**, selon la rédaction du grant | **Forte** (la production reste interdite hors grant) | Non par la licence ; oui via **licence commerciale négociée** que la BSL prévoit explicitement | Compatible avec CLA | **Oui** : à la *Change Date*, ou au plus tard au 4e anniversaire de la première distribution publique de la version ; la *Change License* doit être GPL v2+ ou compatible, d'autres licences possibles (« Licensor may specify additional Change Licenses ») | Très utilisée (HashiCorp, MariaDB, Sentry avant FSL, etc., à vérifier). Le grant est libre, donc **flou possible** : c'est le point faible. « Business Source License » est une marque de MariaDB plc. La licence ne doit pas être modifiée « in any other way » que les paramètres. |
| **FSL-1.1-MIT / FSL-1.1-ALv2** | https://fsl.software/ ; modèle : https://fsl.software/FSL-1.1-MIT.template.md | Tout usage permis sauf « Competing Use » : mettre le logiciel à disposition dans un produit ou service commercial qui le remplace, remplace un autre de tes produits qui l'utilise, ou offre des fonctionnalités identiques ou très similaires. | **Forte** (c'est exactement le Competing Use) | **Forte** | Non | Compatible avec CLA | **Oui, 2 ans fixes**, vers MIT ou Apache 2.0 (le site indique que chaque version se convertit deux ans après sa mise à disposition) | Simple, standardisée, listée Fair Source. Peu de souplesse : pas de paramètres, **pas de seuil de revenu**, durée fixe. |
| **Fair Core License (FCL)** | liste : https://fair.io/licenses/ | Variante de FSL avec support de clés de licence pour fonctionnalités commerciales (selon fair.io) | Forte | Forte | Non | CLA | Oui (comme FSL) | Récente, moins de recul. Textes à lire directement sur fair.io (non lus intégralement ici). |
| **Elastic License 2.0** | https://www.elastic.co/licensing/elastic-license | Usage, copie, distribution, modification permis ; interdit : fournir le logiciel à des tiers comme **service hébergé ou géré**, contourner les clés de licence, retirer les mentions. Inclut une concession de brevets. | **Forte** pour le service managé uniquement | **Moyenne** : seule l'offre en service managé est visée, la revente d'une copie installée n'est pas clairement interdite (à vérifier avec un juriste) | Non | CLA | **Non** | Très répandue (Elastic, et d'autres). Pas de conversion : moins « Fair Source ». |
| **PolyForm Shield 1.0.0** | https://polyformproject.org/licenses/shield/1.0.0 | « Any purpose is a permitted purpose, except for providing any product that competes with the software ». Concurrence : « Goods and services compete even when provided free of charge. » Brevets inclus. | **Forte** | Forte (produit concurrent) | Non | CLA | **Non** | Texte court, lisible. Pas de conversion. |
| **PolyForm Noncommercial 1.0.0** | https://polyformproject.org/licenses/ (URL de la version non confirmée ici) | Usage non commercial uniquement | Forte | Forte | Non | CLA | Non | **Trop restrictif** pour toi : empêcherait même un auto-hébergement commercial par une fintech (à vérifier). |
| **PolyForm Small Business 1.0.0** | https://polyformproject.org/licenses/small-business/1.0.0 | Gratuit pour les entités de **moins de 100 personnes** (employés et sous-traitants) et **moins de 1 000 000 USD (2019) de revenu** l'année précédente (ajusté de l'inflation) ; au-delà, licence commerciale. Délai de régularisation de 32 jours après notification. | Moyenne (un petit concurrent reste autorisé) | Moyenne | **Indirect** (seuil de revenu puis licence payante) | CLA | Non | Seuils en USD, peu adaptés au contexte XOF ; les seuils ne sont pas modifiables sans sortir du texte standard. |
| **PolyForm Free Trial** | https://polyformproject.org/licenses/ (non lu) | Essai limité dans le temps | n/a | n/a | n/a | n/a | Non | Ne convient pas à un self-host gratuit à vie. |
| **AGPL-3.0 + licence commerciale** (double licence) | https://www.gnu.org/licenses/agpl-3.0.html | Open source (approuvée OSI). Section 13 : si tu modifies le programme, tu dois offrir le code source aux utilisateurs distants. Copyleft fort. Tout le monde peut revendre et héberger, **à condition de publier ses modifications sous AGPL**. | **Faible à moyenne** : un concurrent peut héberger Pont Cloud bis, en publiant son code | **Faible** : la revente reste légale | Non par la licence ; oui par **vente d'une licence commerciale** à ceux qui ne veulent pas de l'AGPL | **Très compatible** avec CLA (indispensable pour la double licence) | Non (déjà libre) | Très mature (Qt, MongoDB avant 2018, Grafana). Mais n'empêche pas la concurrence. Beaucoup d'entreprises interdisent l'AGPL en interne. Le projet pourra se dire **open source**. |
| **SSPL v1** | https://www.mongodb.com/legal/licensing/server-side-public-license | Section 13 : qui offre le programme en service doit publier le « Service Source Code » (le code de toute la pile de gestion, d'hébergement, de sauvegarde, etc.) sous SSPL. | Forte en pratique (obligation dissuasive) | Moyenne | Non | CLA | Non | Non approuvée OSI à ma connaissance (page OSI non trouvée, à vérifier) ; rejetée par Debian et Fedora (information de mémoire, à vérifier). Juridiquement incertaine. **Déconseillée**. |
| **Commons Clause** (greffée sur une licence) | https://commonsclause.com/ | Interdit de « Sell » : fournir à des tiers un produit ou service dont la valeur découle « entirely or substantially » des fonctionnalités du logiciel. | Forte (si le service tire sa valeur de Pont) | Forte | Non | CLA | Non | Formulation floue (« substantially »), litiges possibles ; mauvaise réputation communautaire ; le site déconseille le terme « open source ». |
| **Licence propriétaire sur mesure** (source disponible + clause de partage de revenus) | à rédiger par un juriste | Tu écris tout : usage interne gratuit, usage commercial payant, partage de revenus, audit, etc. | Forte | Forte | **Oui, contractuellement** | Compatible avec CLA | À écrire si tu le veux | Seule option qui met le partage de revenus *dans* la licence. Coût juridique élevé, risque de clauses ambiguës ou inapplicables, aucune jurisprudence. Moins de confiance des développeurs (texte inconnu). |
| **Apache-2.0 / MIT** (pour comparaison) | https://www.apache.org/licenses/LICENSE-2.0 ; https://opensource.org/license/mit | Usage, copie, revente, hébergement commercial libres, sans rien devoir | **Nulle** | **Nulle** | **Impossible** | Facile, sans CLA nécessaire | n/a | Tu perds (c), (d) et la possibilité de contrôler l'avenir commercial. Seules les mentions de copyright sont obligatoires. Apache ajoute une concession de brevets et une clause de rétorsion. |
| **Fair Source** (label, pas une licence) | https://fair.io/about/ ; https://fair.io/licenses/ | Désigne un ensemble : lisible, restrictions minimales, publication open source différée. Licences listées : **FSL, FCL, BUSL** | selon la licence | selon la licence | selon la licence | selon la licence | oui (par définition) | Label utile pour la communication et l'alignement avec une communauté existante. |

---

## 3. Le « partage de revenus au contributeur principal »

### Constat

**Aucune licence standard n'impose un partage de revenus.** Les licences ci-dessus *interdisent* ou *autorisent* un usage. Le reversement se fait par un **contrat commercial séparé** conclu avec celui qui veut un usage interdit par la licence publique. La licence publique sert de mur ; la licence commerciale est la porte payante.

### Structure A : licence commerciale négociée au cas par cas (forfait ou pourcentage)

- Fonctionnement : BUSL ou FSL gratuit pour usage interne ; pour toute offre à des tiers, contrat avec toi (forfait annuel, ou x % du chiffre d'affaires lié à Pont, ou les deux).
- Avantages : souple, rien d'automatique à appliquer techniquement, tu choisis tes partenaires.
- Inconvénients : chaque deal à négocier ; les gros acteurs peuvent ignorer le contrat.
- Difficulté d'application et d'audit : **moyenne à forte**. Pour un pourcentage du revenu, il faut un droit d'audit contractuel (accès aux comptes, déclaration annuelle, pénalités). Pratique plus simple : **forfait fixe**, ou un revenu par volume traité (le serveur peut compter les paiements, mais un self-host peut être modifié pour désactiver le compteur).

### Structure B : seuil de revenu

- Fonctionnement : usage commercial gratuit sous X de revenu annuel (ex. XOF), licence commerciale payante au-delà. Modèle proche de PolyForm Small Business (100 personnes et 1 M USD de 2019, ajusté de l'inflation) ou de seuils connus d'autres projets (à vérifier au cas par cas).
- Avantages : encourage l'adoption par les petits acteurs (marché cible), paiement seulement quand l'usager gagne de l'argent, argument « équitable ».
- Inconvénients : définition du « revenu » délicate (revenu de la fintech, ou seulement du produit utilisant Pont ? groupes de sociétés ? conversion XOF/XAF/USD ?). Il faut une licence sur mesure ou un grant BUSL rédigé avec soin. Un seuil ne correspond pas à un partage « en partie » : c'est un déclencheur de licence.
- Difficulté d'application et d'audit : **forte**. Dépend d'une déclaration honnête et d'un droit d'audit contractuel. Le Bénin ne rend pas l'audit à l'étranger facile. Prévoir une clause de loi applicable et d'arbitrage (OHADA / CCJA, à faire valider).

### Structure C : redevance par volume traité (usage-based)

- Fonctionnement : licence commerciale gratuite en self-host interne ; pour offrir un service à des tiers, une redevance de x % des frais perçus sur les transactions traitées via Pont (ou un montant fixe par transaction).
- Avantages : lisible, proportionnelle à l'usage, vérifiable techniquement si le service renvoie des compteurs (télémétrie contractuelle).
- Inconvénients : télémétrie mal perçue ; contournable dans un fork modifié ; Pont étant non-custodial et BYOK, tu ne vois pas les flux sauf si l'opérateur te les déclare.
- Difficulté d'application : **forte** sans accès aux données ; **moyenne** si une clé de licence (type FCL / Elastic) conditionne certaines fonctions. Attention : contourner une clé de licence est interdit par ELv2 et visé par FCL, mais cette protection technique reste contournable dans un fork.

### Observation générale

L'application réelle repose surtout sur : (1) la clarté du texte, (2) le droit d'audit et la loi applicable, (3) la volonté de poursuivre en justice. Pour un revenu partagé « en partie », un **forfait ou un seuil + licence commerciale** est plus réaliste qu'un pourcentage invérifiable. Cette analyse est mon appréciation, à confronter à l'avis d'un juriste.

---

## 4. Sujets annexes

### 4.1 CLA (accord de licence de contributeur)

Pour relicencier plus tard (ex. changer de licence, vendre des licences commerciales, convertir en Apache-2.0 à une date), tu dois détenir les droits ou avoir une licence très large sur chaque contribution externe. Sans CLA, chaque contributeur reste titulaire de son code et son accord est nécessaire pour toute relicence ; la double licence AGPL + commerciale est **impossible** sans CLA. Voir `CLA.md` (rédigé séparément, non créé ici). Le CLA devra aussi traiter la cession ou licence de droits patrimoniaux selon le droit applicable (à faire vérifier : en droit d'auteur de tradition civiliste, l'étendue et la formalité de la cession ont des exigences propres).

### 4.2 Marque

Le nom « Pont » est un nom de code (README). La licence de droit d'auteur **ne couvre pas la marque** : prévoir une politique de marque séparée (usage descriptif autorisé, pas de « Pont Cloud » ou nom confondable pour un service tiers). Avant de communiquer, vérifier la disponibilité et déposer la marque définitive (OAPI couvre les États membres dont le Bénin ; procédure et coûts à vérifier auprès de l'OAPI ou d'un conseil). Le nom étant provisoire, ne pas déposer avant le choix définitif.

### 4.3 Brevets

Apache-2.0, ELv2 et PolyForm Shield contiennent une concession de brevets expresse ; MIT n'en a pas de façon explicite. FSL et BUSL : lire les textes (non vérifié ici pour la BUSL). Tu n'as probablement aucun brevet : la question est surtout de **ne pas être exposé** à une clause de rétorsion. À faire vérifier par le juriste.

### 4.4 Dépendances tierces

Commande demandée : `pnpm licenses list --prod`. **Elle a échoué** dans le dépôt :

```
ERR_PNPM_MISSING_PACKAGE_INDEX_FILE  Failed to find package index file for @napi-rs/lzma-linux-x64-gnu@1.5.1 ... please consider running 'pnpm install'
```

Je n'ai pas lancé `pnpm install` (pas de modification du dépôt). Alternative : un script lisant le champ `license` de chaque `package.json` sous `node_modules/.pnpm` (883 dossiers). **Ce résultat inclut aussi les dépendances de développement, pas uniquement la production**, et dépend de ce qui est installé localement. Il faudra relancer `pnpm licenses list --prod` après `pnpm install`.

Résultat du script (nombre de paquets distincts par licence) :

| Licence déclarée | Paquets |
|---|---|
| MIT | 717 |
| ISC | 57 |
| Apache-2.0 | 44 |
| BSD-3-Clause | 16 |
| BSD-2-Clause | 5 |
| MPL-2.0 | 3 (`lightningcss` et ses binaires linux) |
| LGPL-3.0-or-later | 2 (`@img/sharp-libvips-linux-x64`, `@img/sharp-libvips-linuxmusl-x64`) |
| EPL-2.0 | 2 |
| Unlicense | 2 |
| OFL-1.1 | 1 |
| (MIT OR CC0-1.0) | 1 |
| 0BSD, MIT-0, « MIT and ISC » | 1 chacun |
| CC-BY-4.0 | 1 (`caniuse-lite`, données) |
| (MPL-2.0 OR Apache-2.0) | 1 (`dompurify`) |
| **UNKNOWN (champ absent)** | 1 (`khroma@2.1.0`) |

Points à signaler :

- **Aucune GPL, AGPL ou SSPL** détectée.
- **LGPL-3.0-or-later** : `@img/sharp-libvips-*` (bibliothèque native liée dynamiquement par `sharp`, généralement via Next.js pour les images). La LGPL n'impose pas de changer la licence de ton code si tu n'en modifies pas la bibliothèque, mais impose des notices et la possibilité de remplacer la bibliothèque. À confirmer par le juriste, notamment pour les images Docker distribuées.
- **MPL-2.0** : copyleft au niveau du fichier ; si tu ne modifies pas ces fichiers, l'impact est faible.
- **CC-BY-4.0** (données) : attribution requise.
- **khroma** : licence non lisible dans `package.json` : vérifier son fichier LICENSE.
- Ces licences sont **compatibles** avec une licence source-available pour ton propre code, car tu ne relicencies pas leur code. Le point d'attention est de fournir un fichier de notices (`THIRD-PARTY-NOTICES`) pour les distributions (images Docker incluses).

### 4.5 Contenus non-code

Logos, charte, documentation : licence séparée possible (ex. CC BY-NC-ND 4.0 pour logos et identité ; CC BY ou CC BY-SA pour la documentation si tu veux qu'elle circule). Texte officiel : https://creativecommons.org/licenses/ (non consulté en détail ici). Attention : CC recommande de ne pas utiliser leurs licences pour du logiciel.

### 4.6 Preuve d'antériorité et dépôt

Dater et conserver la preuve de création est utile : historique Git signé, archive horodatée, dépôt chez un tiers de confiance. Pour un dépôt officiel au Bénin ou dans l'espace OAPI/OHADA, je n'ai **pas de source vérifiée** sur l'organisme compétent ni la procédure (le droit d'auteur naît généralement sans dépôt dans les pays de tradition de la Convention de Berne, mais ce point et le rôle éventuel de l'ABDA sont à faire confirmer par un juriste). Ne rien affirmer sans cette confirmation.

### 4.7 Le passé ne se retire pas

Si une version de Pont a déjà été publiée sous une licence permissive (ou même sans licence explicite mais avec une promesse « gratuit à vie »), les personnes qui l'ont obtenue **conservent les droits accordés sur cette version**. Tu pourras changer la licence **pour les versions futures**, mais pas retirer rétroactivement les droits déjà concédés (en principe, à faire valider). Conséquences pratiques :

- Vérifier ce qui a déjà été publié, sous quel texte, et si un dépôt public existe ou a été cloné.
- Choisir la licence **avant** la première vraie publication, si ce n'est pas déjà fait.
- Si le code est déjà public sans licence : sans licence, le droit d'auteur par défaut interdit en principe la réutilisation, mais la promesse « self-host gratuit à vie » du README peut créer des attentes. Garde cette promesse dans le texte de la licence (grant).
- Si des contributeurs ont déjà contribué sans CLA, il faudra leur demander une régularisation.

---

## 5. Recommandations

### Comparaison avec tes cinq exigences

| Exigence | BUSL 1.1 + grant | FSL-1.1 | AGPL-3.0 + commerciale | Sur mesure |
|---|---|---|---|---|
| (a) Auditable, auto-hébergeable | Oui | Oui | Oui | Oui |
| (b) Reste ta propriété | Oui | Oui | Oui | Oui |
| (c) Pas de revente ni d'hébergement concurrent | **Oui** (selon grant) | **Oui** (Competing Use) | **Non** | Oui |
| (d) Part du revenu | Via licence commerciale | Via licence commerciale | Via licence commerciale (seulement pour ceux qui la veulent) | Oui, dans le texte |
| (e) Contributions externes | Oui avec CLA | Oui avec CLA | Oui avec CLA | Oui avec CLA |
| Appelable « open source » | Non | Non | **Oui** | Non |
| Conversion automatique | Oui (max 4 ans) | Oui (2 ans) | n/a | Optionnelle |

### Recommandation n°1 : BUSL 1.1 avec Additional Use Grant, conversion Apache-2.0 après 4 ans

Pourquoi elle colle le mieux :

- Elle satisfait (c) : tout usage en production reste interdit sauf ce que tu autorises. Tu rédiges le grant pour autoriser l'auto-hébergement interne et interdire l'offre de Pont à des tiers.
- Pour (d), la BSL prévoit une licence commerciale (« you must purchase a commercial license from the Licensor ») : c'est le canal de négociation d'un forfait, d'un pourcentage ou d'un seuil.
- Le grant est paramétrable : seuil de revenu, territoires, définition du service concurrent, ce que FSL ne permet pas.
- Conversion automatique : maximum 4 ans par version, ce qui rassure les adopteurs (le code deviendra libre) et reste compatible avec le label Fair Source (fair.io liste BUSL).
- Limite : le grant est libre, donc un texte mal rédigé protège mal. Il faut un juriste. La licence ne doit pas être modifiée en dehors des paramètres.

Si tu préfères la simplicité à la souplesse : **FSL-1.1-Apache-2.0 (ou MIT)** donne l'essentiel de (c) avec un texte standard déjà éprouvé, mais conversion à 2 ans fixes et aucun seuil de revenu. C'est une variante crédible de la recommandation n°1.

### Recommandation n°2 : AGPL-3.0 + licence commerciale (double licence)

Pourquoi elle est classée seconde :

- Avantage : le projet est réellement **open source**, donc meilleure acceptation communautaire, et tu vends une licence commerciale à ceux qui ne veulent pas des obligations AGPL (modèle Qt, ancien MongoDB).
- Inconvénient décisif : **elle ne satisfait pas (c)**. Un tiers peut héberger un « Pont Cloud bis » ou revendre, du moment qu'il publie ses modifications. Ton avantage compétitif ne tient alors qu'à la marque, au service et aux relations. Elle protège mieux contre l'appropriation propriétaire que contre la concurrence.
- Si ta priorité réelle est la réputation et la contribution plutôt que le blocage de la concurrence, c'est le bon choix.

### Brouillon d'« Additional Use Grant » BUSL (à valider par un juriste)

Cadre officiel : la BSL demande que le Licensor précise le grant ou « None » (https://mariadb.com/bsl11/). Ce qui suit est **ma proposition de rédaction, pas un texte officiel**. La version anglaise est le texte de référence juridique à publier avec la licence.

**Version anglaise (à valider par un juriste)**

```
Licensor:             François Mawutô Aboudou ZINSOU [or legal entity]
Licensed Work:        Pont [version]
                      The Licensed Work is (c) [year] [Licensor].
Additional Use Grant: You may make production use of the Licensed Work,
                      free of charge, provided that you do not offer the
                      Licensed Work, or a Substantially Equivalent Service,
                      to third parties.

                      "Substantially Equivalent Service" means a product or
                      service, hosted, managed or otherwise made available
                      to third parties, whose value derives entirely or
                      primarily from the payment-orchestration, wallet,
                      ledger or key-management functionality of the Licensed
                      Work, or that offers the same or substantially similar
                      functionality.

                      For the avoidance of doubt, the following are allowed
                      without a commercial license: (i) running the Licensed
                      Work for your own internal business purposes, including
                      to process payments of your own customers through your
                      own application; (ii) providing consulting,
                      integration or support services to a customer who runs
                      their own instance; (iii) non-production use.

                      Any use not permitted above requires a commercial
                      license from the Licensor.
Change Date:          [four years from the first public release of each
                      version, or an earlier fixed date]
Change License:       Apache License, Version 2.0
```

**Version française (traduction de travail, non contractuelle)**

```
Concédant :            François Mawutô Aboudou ZINSOU [ou personne morale]
Œuvre sous licence :   Pont [version]
Usage supplémentaire
autorisé :             Vous pouvez utiliser l'Œuvre en production,
                       gratuitement, à condition de ne pas offrir l'Œuvre,
                       ni un Service Substantiellement Équivalent, à des tiers.

                       « Service Substantiellement Équivalent » désigne un
                       produit ou service, hébergé, géré ou autrement mis à
                       disposition de tiers, dont la valeur provient
                       entièrement ou principalement des fonctions
                       d'orchestration de paiement, de portefeuille, de
                       registre ou de gestion de clés de l'Œuvre, ou qui offre
                       des fonctionnalités identiques ou substantiellement
                       similaires.

                       Pour éviter tout doute, sont autorisés sans licence
                       commerciale : (i) l'exploitation de l'Œuvre pour vos
                       propres besoins internes, y compris le traitement des
                       paiements de vos propres clients via votre propre
                       application ; (ii) la prestation de conseil,
                       d'intégration ou de support à un client qui exploite sa
                       propre instance ; (iii) tout usage hors production.

                       Tout usage non autorisé ci-dessus exige une licence
                       commerciale du Concédant.
Date de changement :   [quatre ans après la première publication de chaque
                       version, ou une date fixe plus proche]
Licence de changement: Apache License, Version 2.0
```

Points d'attention du brouillon :

- « Offrir à des tiers » doit être clairement distingué de « traiter les paiements de ses propres clients avec sa propre instance » (cas typique d'une fintech cliente de Pont).
- Le cas d'une agence qui déploie Pont pour le compte d'un client est ambigu : à trancher (la ligne (ii) le permet seulement si le client contrôle l'instance).
- Si tu veux un seuil de revenu, il faut l'ajouter ici (voir paramètres).
- Ne pas modifier le reste du texte BUSL.

### Paramètres à décider

1. **Période de conversion** : 4 ans (maximum BSL) ou moins ? FSL fixe 2 ans.
2. **Licence de conversion** : Apache-2.0 (brevets, recommandé) ou MIT, ou GPL v2+ (compatible BSL). Plus tard, change ou non pour la première version déjà publiée ?
3. **Seuil de revenu** éventuel : aucun, ou gratuit sous X XOF de revenu annuel, avec quelle définition de « revenu », quelle devise, quel périmètre de groupe ?
4. **Définition du « service concurrent »** : paiement seulement, ou aussi portefeuille, registre, KYC, SDK ? Les agences d'intégration et les fintechs clientes sont-elles couvertes ?
5. **Territoires** : mondial, ou différenciation Afrique / reste du monde (attention : une restriction territoriale complique le texte, la perception et l'application) ?
6. **Licence commerciale** : forfait, pourcentage ou seuil, droit d'audit, durée, loi applicable et arbitrage (OHADA/CCJA ou autre, à valider).
7. **Licence des contenus non-code** et politique de marque.

---

## 6. Questions à poser au propriétaire

1. **Veux-tu pouvoir dire « open source » (AGPL) ou assumes-tu « source disponible / Fair Source » (BUSL/FSL) ?** Tu ne peux pas avoir à la fois (c) et le label open source.
2. **Qui est autorisé à gagner de l'argent avec Pont sans te payer ?** Une fintech qui l'utilise pour ses propres clients ? Une agence qui l'installe chez un client ? Un revendeur qui l'héberge ? C'est la ligne que le grant doit tracer.
3. **Quel mécanisme de revenu partagé veux-tu : forfait fixe, pourcentage, seuil de revenu (et à quel montant en XOF), ou volume de transactions ?** Et acceptes-tu d'imposer un audit contractuel et/ou une télémétrie ?
4. **Combien de temps le code reste-t-il restreint avant de devenir libre (2 ans FSL, jusqu'à 4 ans BUSL, ou jamais), et sous quelle licence de conversion ?**
5. **Où en est la publication : du code est-il déjà public, sous quel texte, et des contributions externes ont-elles déjà été acceptées sans CLA ?** (Cela conditionne ce qui peut encore être changé et ce qui est irrévocable.)

---

## Annexe : sources officielles consultées (2026-10-28)

- OSI, Open Source Definition : https://opensource.org/osd
- Business Source License 1.1 (MariaDB) : https://mariadb.com/bsl11/ ; SPDX : https://spdx.org/licenses/BUSL-1.1.html
- Functional Source License : https://fsl.software/ ; modèle FSL-1.1-MIT : https://fsl.software/FSL-1.1-MIT.template.md
- Fair Source : https://fair.io/about/ ; https://fair.io/licenses/
- Elastic License 2.0 : https://www.elastic.co/licensing/elastic-license
- PolyForm Shield 1.0.0 : https://polyformproject.org/licenses/shield/1.0.0 ; Small Business 1.0.0 : https://polyformproject.org/licenses/small-business/1.0.0
- SSPL (MongoDB) : https://www.mongodb.com/legal/licensing/server-side-public-license
- Commons Clause : https://commonsclause.com/
- AGPL-3.0 : https://www.gnu.org/licenses/agpl-3.0.html

Non vérifié sur la source officielle (à confirmer) : texte intégral de PolyForm Noncommercial et Free Trial, statut OSI de la SSPL (page OSI introuvable), textes FCL et de la BUSL complète (le bloc de paramètres n'était pas lisible via mes outils), exemples d'adopteurs cités, procédures de dépôt OAPI/ABDA.
