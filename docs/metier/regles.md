# Règles métier

Chaque règle porte un identifiant stable. Ne jamais réutiliser un identifiant supprimé.

| ID | Règle | Origine |
|---|---|---|
| R-001 | Un paiement ne passe à `succeeded` qu'après vérification auprès de l'agrégateur (`adapter.verify`). | Cahier des charges §7.2 |
| R-002 | Montants en unités entières de la devise (XOF, XAF). | §6 F2 |
| R-003 | Le contenu d'un webhook agrégateur n'est jamais une preuve : il déclenche une vérification. (PayDunya : hash IPN potentiellement statique.) | agregateurs/paydunya.md |
| R-004 | `Idempotency-Key` obligatoire sur toute création ; même clé + corps différent → 409. Pont garantit l'idempotence même si l'agrégateur ne la fournit pas (FedaPay). | §9.2, fedapay.md |
| R-005 | Statut ambigu après envoi de la demande au client → vérification uniquement, jamais de nouvel essai chez un autre agrégateur. | §6 F10 |
| R-006 | Failover autorisé seulement si l'échec survient avant l'envoi de la demande au client. | §6 F10 |
| R-007 | Le montant est toujours fixé côté serveur ; le front ne transmet qu'un identifiant de paiement. | §9.2 |
| R-008 | Toute contrainte d'agrégateur (ex. montant multiple de 5 chez CinetPay) est validée explicitement ; jamais d'arrondi silencieux. | cinetpay.md |
| R-009 | Webhook entrant : répondre 2xx immédiatement après stockage, traiter en asynchrone (FedaPay désactive l'endpoint après 10 échecs). | fedapay.md |
| R-010 | Pont ne stocke aucune clé d'agrégateur sans accord écrit de l'agrégateur concerné. | ADR-001 (accepté) |
| R-011 | Marchand avec Kkiapay connecté : pas de multi-agrégateurs ni de failover (CGU Art. 18), sauf accord écrit. | ADR-001 (accepté) |
| R-013 | Un succès n'est accepté que si montant, devise et tentative (`attemptRef`) relus chez l'agrégateur correspondent au paiement ; sinon `failed` + réconciliation. Une transaction de widget ne peut être rattachée qu'à un seul paiement. | Moteur, sprint 1 |
| R-014 | Dans un parcours par redirection, un échec à la création est toujours sans risque (le client n'a rien reçu) ; dans un paiement direct (push), tout échec non explicite après l'envoi est ambigu. | Adaptateurs, sprint 1 |
| R-015 | Exception inattendue d'un adaptateur pendant la création → paiement `processing` à réconcilier, jamais perdu. | Moteur, sprint 1 |
| R-016 | Retraits : opérateur obligatoire, pas de failover (le solde est propre à chaque agrégateur). Création non envoyée (FedaPay `pending`, PayDunya `created`) = sans risque ; échec après l'envoi = ambigu. | Sprint 2 |
| R-017 | Remboursements : uniquement sur un paiement `succeeded`/`partially_refunded` ; total remboursé ≤ montant payé ; paiement → `partially_refunded` puis `refunded` selon les remboursements réussis. | Sprint 2 |
| R-018 | Un statut d'agrégateur inconnu ne devient jamais un succès ; sans sandbox, voir `fidelite-doc.md`. | Sprint 2 |
| R-019 | Webhooks sortants : HTTPS obligatoire en live, adresses internes et redirections refusées (SSRF), signature recalculée à chaque tentative, ~3 jours de reprises. | Sprint 2 |
| R-020 | Instruction du dashboard vers le backend du marchand : signée, horodatée (± 5 min), à usage unique (nonce), limitée à un périmètre et un plafond fixés par le marchand ; refusable. | ADR-001 (accepté) |
| R-012 | Chaque connexion d'agrégateur affiche au marchand les clauses CGU qui le concernent. | ADR-001 (accepté) |

## Registre, portefeuilles, plafonds (ADR-002, ADR-003)

| ID | Règle | Origine |
|---|---|---|
| R-030 | Toute écriture est équilibrée (total débits = total crédits), en une seule devise, avec au moins deux lignes de montants entiers strictement positifs. Une écriture n'est jamais modifiée ni supprimée : on la corrige par une écriture inverse. | ADR-002 |
| R-031 | Un compte utilisateur (`available`, `held`) ne peut jamais devenir négatif. Le contrôle et l'écriture sont atomiques : deux retraits simultanés ne peuvent pas dépasser le solde. | ADR-002 |
| R-032 | Un dépôt n'est crédité qu'après la confirmation du paiement par l'agrégateur (R-001), une seule fois par paiement (clé d'idempotence = identifiant du paiement). | ADR-002 |
| R-033 | Retrait : les fonds passent de `available` à `held` avant l'envoi à l'agrégateur ; à la confirmation, `held` sort vers le compte de transit ; en cas d'échec, `held` revient à `available`. Jamais d'envoi sans blocage préalable. | ADR-002 |
| R-034 | La réconciliation compare le solde du compte de transit (par agrégateur et devise) au solde réel chez l'agrégateur ; tout écart est signalé, jamais corrigé automatiquement. | ADR-002 |
| R-035 | Plafonds par palier KYC : solde maximal, opération unitaire maximale, sorties sur 24 h et sur 30 jours glissants. Un compte gelé n'effectue aucune sortie. Le contrôle précède le blocage des fonds. | ADR-003 |
| R-036 | Comptes système (transit, frais) : ils peuvent être négatifs (soldes d'ouverture non saisis), mais chaque écart est visible à la réconciliation. | ADR-002 |
