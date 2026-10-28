# E-mail (SMTP) et alertes

Deux pages du dashboard, réservées à la permission `parametres` (`lire` pour voir, `gerer` pour modifier) : **E-mail** et **Alertes**. L'administrateur (accès total) l'a d'office ; les autres rôles l'ajoutent depuis la page Rôles.

Prérequis : le coffre, c'est-à-dire `PONT_ENCRYPTION_KEY` (voir [clés et webhooks](cles-et-webhooks.md)). Sans lui, les deux pages l'indiquent et l'API répond `409 vault_disabled`.

## Brancher son SMTP

Page **E-mail** : hôte, port, sécurité, utilisateur, mot de passe, expéditeur.

| Sécurité | Port usuel |
|---|---|
| STARTTLS | 587 |
| TLS | 465 |
| Aucune | 25 ou 1025, réseau local seulement |

- Le mot de passe est **chiffré dans le coffre** (AES-256-GCM) et ne s'affiche plus jamais : champ vide = valeur conservée.
- Le bouton **Envoyer un e-mail de test** envoie un message à l'adresse de votre choix et affiche l'erreur de l'hôte en cas d'échec (jamais les identifiants).
- Sans SMTP, rien ne change : aucun e-mail n'est envoyé, la page de connexion n'affiche pas « Mot de passe oublié ? ».

Envoi : nodemailer 10, depuis le serveur Pont (le dashboard lui délègue les envois). Aucun e-mail ne part à votre insu : seules les fonctions ci-dessous envoient.

## Mot de passe oublié

Quand le SMTP est configuré, la page de connexion propose **Mot de passe oublié ?** :

1. `/mot-de-passe-oublie` : la personne saisit son adresse. La réponse est **la même** que le compte existe ou non.
2. Elle reçoit un lien valable **1 heure**, à usage unique.
3. `/reinitialiser` : elle choisit un mot de passe d'au moins 12 caractères, puis revient à la connexion.

Sans SMTP, la page explique qu'un administrateur doit réinitialiser le mot de passe.

## Alertes

Page **Alertes** : règles à cocher, destinataires, seuil. **Toutes les règles sont désactivées par défaut.**

| Règle | Se déclenche quand |
|---|---|
| Paiement échoué | un paiement passe en échec (dernières 24 h) |
| Webhook non livré | une livraison est abandonnée après toutes ses relances |
| Retrait bloqué ou ambigu | un retrait demande une vérification, ou reste en attente plus d'une heure |
| Solde de transit bas | un compte `system:transit:*` passe sous le seuil (PostgreSQL seulement) |
| Connexion administrateur | un administrateur ouvre une session |

Fonctionnement :
- Le planificateur évalue les règles à chaque cycle (`PONT_TICK_SECONDS`, 30 s par défaut).
- **Un seul e-mail récapitulatif par cycle** (20 alertes au plus), jamais deux fois la même alerte : une empreinte (paiement, livraison, retrait ou compte) est mémorisée 7 jours (24 h pour le solde bas).
- Sans SMTP ou sans destinataire, rien n'est marqué comme envoyé : les alertes partent dès que la configuration est complète.
- Un envoi en échec est consigné « Échec » dans l'historique et retenté au plus toutes les 15 minutes. Une alerte qui échoue ne bloque jamais la réconciliation.
- L'historique garde les 200 dernières alertes (chiffrées dans le coffre, comme le reste).
- **Envoyer une alerte de test** vérifie la chaîne complète.

## API admin

Jeton admin requis.

| Route | Rôle |
|---|---|
| `GET /admin/email` | Configuration SMTP (mot de passe jamais renvoyé : `passwordSet`) |
| `PUT /admin/email` | Enregistre ; un mot de passe omis est conservé |
| `DELETE /admin/email` | Supprime la configuration |
| `POST /admin/email/test` | `{ "to": "…" }` : e-mail de test |
| `POST /admin/email/send` | `{ "to", "subject", "text" }` : envoi utilisé par le dashboard. `409 smtp_not_configured`, `502 smtp_error` |
| `GET /admin/alerts`, `PUT /admin/alerts` | Règles, destinataires, seuil, historique |
| `POST /admin/alerts/test` | Alerte de test |
| `POST /admin/alerts/events` | `{ "rule": "admin_login", "detail": "…" }` (émis par le dashboard) |

## Essayer sans compte SMTP : Mailpit

Une boîte mail locale, rien ne sort de la machine :

```bash
cd deploy/self-host
docker compose --profile mail up -d mailpit
```

Puis page E-mail : hôte `mailpit`, port `1025`, sécurité « Aucune », expéditeur au choix. Les messages se lisent sur http://localhost:8025.

## Limites

- Un seul SMTP et un seul jeu de destinataires pour toute l'instance.
- Pas de modèles d'e-mail personnalisables, ni de SMS ou WhatsApp.
- Seule la réinitialisation de mot de passe passe par Better Auth : pas encore d'e-mail de vérification ni d'invitation.
- Le solde de transit bas suppose des comptes `system:transit:*` (portefeuille, PostgreSQL) ; le seuil et la lecture du solde sont à valider sur vos flux réels.
