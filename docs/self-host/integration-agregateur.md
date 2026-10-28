# Brancher un agrégateur que Pont ne connaît pas

`pont provider new` génère l'adaptateur d'un agrégateur personnalisé à partir de sa description : endpoints, noms des clés, authentification, correspondance des statuts et signature des webhooks. Le résultat est un dossier TypeScript autonome (adaptateur, tests, README).

## Deux façons de le décrire

```bash
pont provider new                      # questions, une par une (valeur par défaut = Entrée)
pont provider new --from spec.json     # sans question, depuis un fichier
pont provider new --dry-run            # montre les fichiers sans rien écrire
pont provider new --out ./adapters/mon-agregateur --force
```

Le dossier créé s'appelle `pont-adapter-<id>` (ou `--out`). Un dossier existant n'est jamais remplacé sans `--force`.

## Partir de la spécification de l'API (`pont provider import`)

Les noms de paramètres ne doivent pas venir de la mémoire de quelqu'un. Quand l'agrégateur publie une spécification OpenAPI 3 (JSON ou YAML), Pont la lit :

```bash
pont provider import https://api.agregateur.com/openapi.json     # https:// seulement
pont provider import ./openapi.yaml --out ./mon-agregateur.draft.json
pont provider new --from ./mon-agregateur.draft.json              # après avoir complété le brouillon
```

La commande écrit un **brouillon** (`<id>.draft.json`) et un compte rendu en trois blocs :

- **Lu dans la spécification** : noms exacts des champs, chemins, adresses de base (la sandbox n'est reprise que si elle est nommée comme telle), schéma d'authentification, valeurs de statut listées.
- **À relire** : ce qui est déduit des noms (`msisdn` devient `{phone}`, `merchant_reference` devient `{attemptId}`…), les opérations candidates écartées, les statuts ambigus.
- **À renseigner à la main** : ce que la spécification ne dit pas (signature des webhooks, pays, champs obligatoires sans équivalent Pont, valeurs de statut non listées).

Garde-fous : un statut ambigu (`ACCEPTED`, `APPROVED`…) n'est jamais classé en succès, il reste `pending` ; les champs obligatoires inconnus reçoivent la valeur `A_COMPLETER_<champ>` et `pont provider new --from` refuse le fichier tant qu'il en reste un ; une adresse sandbox absente n'est pas remplacée par l'adresse live.

## Ce qui reste à faire (suite de l'import)

| Chantier | Pourquoi |
|---|---|
| Documentation sans OpenAPI (`llms.txt`, pages web) | Texte libre : lecture assistée par l'agent IA via le MCP, avec validation humaine de la table de correspondance |
| Tests de contrat générés | Exemples de requêtes et de réponses (tirés de la spécification ou d'un sandbox) qui vérifient le mapping |
| `pont provider check` | Appeler le sandbox avec une clé de test et confirmer que les champs et les statuts existent vraiment |
| Swagger 2.0, collections Postman | Aujourd'hui : conversion préalable en OpenAPI 3 |
| `$ref` externes, `oneOf` / `anyOf` | Seuls les `$ref` locaux (`#/...`) et `allOf` sont suivis |
| Signatures de webhooks asymétriques, OAuth2, requêtes signées | Absents du schéma de description |
| Plusieurs paramètres de chemin | Seul `{providerRef}` est géré |
| Essai contre un vrai sandbox d'agrégateur | La spécification dit comment l'API doit marcher, pas comment elle se comporte |

## Deux adresses à ne pas confondre

- `{callbackUrl}` : l'adresse du webhook de Pont, où l'agrégateur notifie le résultat.
- `{returnUrl}` : la page où le client revient après avoir payé (celle que le marchand passe dans `returnUrl`). Disponible à la création d'un paiement ; omise quand le marchand n'en fournit pas.

La page de paiement que l'agrégateur renvoie au client se récupère avec `deposit.response.redirectUrl`.

## Ce que le générateur demande

| Information | Exemple |
|---|---|
| Identifiant et nom | `monagregateur`, `MonAgrégateur` |
| Pays et devises | `BJ,TG` · `XOF` |
| Opérateurs (facultatif) | `mtn_bj,moov_bj` (vide = tous) |
| URL de base test et live | `https://sandbox.agregateur.com/v1` |
| Noms des clés à fournir | `secretKey`, `merchantId` |
| Authentification | `bearer`, `basic` (identifiant + mot de passe) ou `header` (ex. `X-Api-Key`) |
| Création de paiement | méthode, chemin, corps JSON avec variables, chemin de l'identifiant dans la réponse, chemin de l'URL de redirection (vide = demande sur le téléphone) |
| Vérification de paiement | méthode, chemin (`/payments/{providerRef}`), chemins du statut, du montant, de la devise, du code d'échec |
| Statuts | `PAID=succeeded,FAILED=failed,WAITING=pending` |
| Retraits, remboursements (facultatif) | création + vérification, avec leur table de statuts |
| Webhooks | en-tête de signature, HMAC `sha256` ou `sha512`, encodage `hex` ou `base64`, préfixe (`sha256=`), charge signée (`body` ou `timestamp.body` avec l'en-tête d'horodatage), chemin de l'identifiant de l'opération |

**Variables utilisables dans les corps et chemins** : paiement `{amount} {currency} {reference} {attemptId} {callbackUrl} {phone} {country} {description} {customerName} {customerEmail} {operator}` ; retrait idem avec `{recipientName} {recipientEmail}` ; remboursement `{amount} {currency} {attemptId} {paymentRef} {paymentAttemptId}` ; vérification `{providerRef} {attemptId}`. Une valeur qui est exactement `"{amount}"` reste un nombre dans le JSON envoyé. `{operator}` se traduit par `operatorCodes` s'il est fourni.

## Exemple de fichier `spec.json`

```json
{
  "id": "monagregateur", "label": "MonAgrégateur",
  "countries": ["BJ", "TG"], "currencies": ["XOF"],
  "baseUrl": { "test": "https://sandbox.mon.test/v1", "live": "https://api.mon.test/v1" },
  "keys": ["secretKey"],
  "auth": { "type": "bearer", "key": "secretKey" },
  "deposit": {
    "method": "POST", "path": "/payments",
    "body": { "amount": "{amount}", "currency": "{currency}", "phone": "{phone}", "merchant_ref": "{attemptId}", "callback": "{callbackUrl}" },
    "response": { "providerRef": "data.id", "redirectUrl": "data.checkout_url" }
  },
  "verify": { "method": "GET", "path": "/payments/{providerRef}", "response": { "status": "data.status", "amount": "data.amount", "currency": "data.currency", "attemptRef": "data.merchant_ref" } },
  "statusMap": { "PAID": "succeeded", "FAILED": "failed", "WAITING": "pending" },
  "webhook": {
    "header": "X-Mon-Signature", "algorithm": "sha256", "encoding": "hex", "prefix": "sha256=",
    "payload": "timestamp.body", "timestampHeader": "X-Mon-Timestamp",
    "lookup": { "path": "data.id", "by": "providerRef" }
  }
}
```

Le fichier est validé (Zod) : une erreur indique le champ fautif (`deposit.body : Variable {x} inconnue…`) et rien n'est généré. Sont refusés : variable inconnue, clé d'authentification absente de `keys`, nom de clé réservé (`mode`, `webhookSecret`, `fetch`, `now`), URL en `http://` (sauf localhost), retrait sans vérification ni table de statuts, `timestamp.body` sans en-tête d'horodatage.

## Ce que contient le dossier généré

- `src/index.ts` : classe `<Id>Adapter` qui implémente `ProviderAdapter`. Toute la description est la constante `SPEC` en tête de fichier, modifiable à la main.
- `test/adapter.test.ts` : tests vitest avec un **faux serveur** (`fetch` injecté).
- `spec.json`, `package.json`, `tsconfig.json`, `README.md` (variables d'environnement conseillées, utilisation).

Règles de Pont appliquées par le code généré :
- un paiement ne passe à `succeeded` qu'après `verify()` ; un statut absent de la table reste `pending` (retraits et remboursements : `processing`) ;
- connexion impossible avant envoi : `unavailable_before_push` (un autre agrégateur peut être tenté) ; réponse 429 idem ;
- échec après l'envoi (coupure, 5xx, réponse sans identifiant) : `ambiguous`, jamais de nouvel essai ailleurs ;
- refus 4xx : `rejected` avec le message de l'agrégateur, sans secret ;
- signature des webhooks comparée en temps constant, horodatage contrôlé (anti-rejeu) si la charge signée en contient un, JSON invalide rejeté ;
- aucun secret dans le code : les clés arrivent par la configuration du constructeur.

## Utilisation

```bash
cd pont-adapter-monagregateur
pnpm install && pnpm test
```

```ts
const adapter = new MonagregateurAdapter({ mode: "test", secretKey: process.env.MONAGREGATEUR_SECRET_KEY!, webhookSecret: process.env.MONAGREGATEUR_WEBHOOK_SECRET! });
const pont = new PontEngine({ adapters: [adapter], /* stores, callbackUrl… */ });
```

## Le brancher au serveur self-host

Copiez le dossier généré dans `deploy/self-host/plugins/<id>/` (monté en lecture seule dans le conteneur, variable `PONT_PLUGINS_DIR`). Chaque sous-dossier est un agrégateur et doit contenir :

| Fichier | Rôle |
|---|---|
| `spec.json` | Lu par Pont : `id`, `label`, `keys` (noms des clés demandées). Généré avec l'adaptateur |
| `dist/index.js`, `index.js`, `src/index.ts` ou `index.ts` | Point d'entrée, cherché dans cet ordre. Il exporte une classe `*Adapter`. `src/index.ts` fonctionne parce que le serveur tourne avec `tsx` (`pnpm start`) |

Au démarrage, Pont charge chaque dossier. Un dossier défaillant (spec illisible, pas de point d'entrée, identifiant déjà pris par un agrégateur intégré…) est **signalé** dans `pluginErrors` sans empêcher le serveur de démarrer. Il faut redémarrer le serveur pour qu'un nouveau dossier soit pris en compte ; la saisie des clés, elle, s'applique à chaud.

Ensuite :
1. La page **Clés** du dashboard liste l'agrégateur (champ `custom: true`) avec ses clés et le secret de webhook. Saisie, masquage, chiffrement et suppression sont ceux des agrégateurs intégrés (coffre, `PONT_ENCRYPTION_KEY`).
2. Sans coffre, les clés se donnent par variables d'environnement : `<ID>_<CLE>` en majuscules (`MONAGREGATEUR_SECRET_KEY`) et `<ID>_WEBHOOK_SECRET`.
3. Déclarez chez l'agrégateur l'URL `<PONT_PUBLIC_URL>/hooks/<id>`. Pont vérifie la signature, puis appelle `verify()` : un paiement ne passe à `succeeded` qu'après cette vérification.
4. Les règles du moteur s'appliquent : Kkiapay reste exclusif (CGU Art. 18), un identifiant n'existe qu'une fois, test et live ne se mélangent pas. En sandbox (`PONT_SANDBOX=true`), seul le simulateur est actif : plugins et coffre sont ignorés.

**Sécurité : le plugin est du code exécuté par le serveur.** Charger un dossier lance son `index` avec les mêmes droits que le serveur Pont (accès réseau, variables d'environnement, base de données). N'y mettez que du code généré par vous ou relu : ne le remplissez jamais depuis une source non fiable (téléversement, dépôt public non relu). Le dossier est monté en lecture seule et seul le propriétaire du serveur y écrit ; le dashboard ne permet pas d'ajouter de code.

Les imports (`@pont-bj/core`) se résolvent depuis `packages/server` : dans le conteneur, le dossier est monté sous `/app/packages/server/plugins` pour cette raison. En dehors de Docker, placez `PONT_PLUGINS_DIR` sous `packages/server/` ou installez `@pont-bj/core` dans le dossier du plugin.

### Contrat de l'API admin (ce que le dashboard affiche)

`GET /admin/providers` :

```json
{
  "vault": true,
  "data": [
    { "id": "fedapay", "label": "FedaPay", "source": "none", "configured": false, "webhookUrl": "https://…/hooks/fedapay", "fields": [ … ] },
    {
      "id": "monagregateur", "custom": true, "label": "MonAgrégateur",
      "source": "vault", "configured": true,
      "webhookUrl": "https://…/hooks/monagregateur",
      "fields": [
        { "name": "secretKey", "label": "secretKey", "secret": true, "required": true, "set": true, "value": "••••3456" },
        { "name": "webhookSecret", "label": "webhookSecret", "secret": true, "required": true, "set": true, "value": "••••3456" }
      ]
    }
  ],
  "pluginErrors": [ { "dir": "mon-dossier", "message": "spec.json absent (…)" } ]
}
```

- `source` : `vault` (saisi dans le dashboard), `env` (variables d'environnement) ou `none`. `value` est toujours masqué (`••••` + 4 derniers caractères) : un secret n'est jamais renvoyé en entier.
- Les agrégateurs personnalisés ont `custom: true`, des champs tous secrets et tous requis : les clés de `spec.json` puis `webhookSecret`. `label` reprend le nom de la clé (à mettre en forme côté interface).
- `PUT /admin/providers/<id>` : `{ "secretKey": "…", "webhookSecret": "…" }`. Un champ omis garde sa valeur. `422 invalid_configuration` si des clés manquent ou si la combinaison est refusée (Kkiapay…), `400` pour un champ inconnu, `409 vault_disabled` sans coffre. Le moteur est reconstruit sans redémarrage.
- `DELETE /admin/providers/<id>` retire les clés du coffre.

## Limites : à lire avant de s'y fier

- **Testé avec un faux serveur seulement.** Les tests prouvent que l'adaptateur applique la description que vous avez donnée, pas que l'agrégateur répond ainsi. Aucun agrégateur réel n'a été contacté. Passez par le sandbox de l'agrégateur avant le live.
- **Formats couverts** : API JSON, authentification Bearer/Basic/en-tête, webhooks signés par HMAC. Ne sont pas couverts : signatures asymétriques (RSA, RFC 9421), OAuth avec jeton à renouveler, corps non JSON (formulaire, XML), pagination, appels en plusieurs temps (création puis jeton puis envoi, comme FedaPay) : écrivez l'adaptateur à la main en vous inspirant de `packages/adapters/*`.
- Les pays se déclarent par code ISO, mais seuls les pays connus de `@pont-bj/core` ont une vérification de numéro de téléphone.
