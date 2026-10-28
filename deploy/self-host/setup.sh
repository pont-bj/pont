#!/usr/bin/env bash
# Première installation de Pont en self-host. Sûr à relancer : les secrets existants ne sont jamais écrasés.
#   ./setup.sh                    stockage PostgreSQL (par défaut)
#   ./setup.sh --store convex     stockage Convex (paiements seulement)
#   ./setup.sh --prod             production : proxy Caddy en HTTPS (80/443), services internes non exposés
#                                 domaines : PONT_DOMAIN et DASHBOARD_DOMAIN (variables d'environnement, .env, ou questions)
#   ./setup.sh --dev              revient au mode développement (ports ouverts sur la machine)
# Ne supprime jamais de volume : vos données restent.
set -euo pipefail
cd "$(dirname "$0")"

command -v docker >/dev/null || { echo "Docker est requis." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl est requis." >&2; exit 1; }

store_arg=""; mode_arg=""
while [ $# -gt 0 ]; do
  case "$1" in
    --store) store_arg="${2:-}"; shift 2 || { echo "--store attend convex ou postgres." >&2; exit 1; } ;;
    --prod) mode_arg="prod"; shift ;;
    --dev) mode_arg="dev"; shift ;;
    *) echo "Option inconnue : $1 (--store convex|postgres, --prod, --dev)." >&2; exit 1 ;;
  esac
done
case "$store_arg" in "" | convex | postgres) ;; *) echo "Stockage inconnu : $store_arg (convex ou postgres)." >&2; exit 1 ;; esac

[ -f .env ] || cp .env.example .env
chmod 600 .env

set_var() { # set_var NOM VALEUR : écrit seulement si la variable est absente ou vide
  local name="$1" value="$2"
  if grep -qE "^${name}=.+" .env; then return; fi
  grep -vE "^${name}=" .env > .env.tmp || true
  printf '%s="%s"\n' "$name" "$value" >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
}
get_var() { { grep -E "^$1=" .env || true; } | tail -n 1 | cut -d= -f2- | tr -d '"'; }
force_var() { grep -vE "^$1=" .env > .env.tmp || true; printf '%s="%s"\n' "$1" "$2" >> .env.tmp; mv .env.tmp .env; chmod 600 .env; }

[ -n "$store_arg" ] && force_var PONT_STORE "$store_arg"
[ -n "$mode_arg" ] && force_var PONT_PROD "$([ "$mode_arg" = prod ] && echo true || echo false)"
prod=false; [ "$(get_var PONT_PROD)" = "true" ] && prod=true
store="$(get_var PONT_STORE)"; store="${store:-postgres}"

for name in PONT_API_KEY PONT_ADMIN_TOKEN PONT_STORE_SECRET PONT_ENCRYPTION_KEY BETTER_AUTH_SECRET; do set_var "$name" "$(openssl rand -hex 32)"; done

profiles=""
if [ "$store" = "convex" ]; then
  set_var INSTANCE_SECRET "$(openssl rand -hex 32)"
  profiles="convex"
else
  set_var POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  # Base fournie seulement si DATABASE_URL est vide ; sinon, on utilise la base du client.
  if [ -z "$(get_var DATABASE_URL)" ]; then profiles="postgres"; fi
fi

if [ "$prod" = "true" ]; then
  valid_host() { printf '%s' "$1" | grep -qE '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$|^([a-z0-9-]+\.)*localhost$'; }
  ask_domain() { # ask_domain NOM QUESTION : variable d'environnement, puis .env, puis question
    local name="$1" question="$2" value="${!1:-}"
    [ -n "$value" ] || value="$(get_var "$name")"
    if [ -z "$value" ] && [ -t 0 ]; then read -r -p "$question " value; fi
    value="${value#https://}"; value="${value%/}"
    valid_host "$value" || { echo "$name : nom de domaine invalide ou absent (ex. api.votre-fintech.com, sans port ni chemin). Renseignez-le dans .env ou en variable d'environnement." >&2; exit 1; }
    force_var "$name" "$value"
  }
  ask_domain PONT_DOMAIN "Domaine de l'API et des webhooks (ex. api.votre-fintech.com) :"
  ask_domain DASHBOARD_DOMAIN "Domaine du dashboard (ex. dashboard.votre-fintech.com) :"
  pont_domain="$(get_var PONT_DOMAIN)"; dash_domain="$(get_var DASHBOARD_DOMAIN)"
  [ "$pont_domain" != "$dash_domain" ] || { echo "PONT_DOMAIN et DASHBOARD_DOMAIN doivent être deux noms différents." >&2; exit 1; }
  force_var PONT_PUBLIC_URL "https://$pont_domain"
  force_var DASHBOARD_URL "https://$dash_domain"
  # Origines autorisées à appeler l'authentification : on ajoute le dashboard sans écraser les vôtres.
  origins="$(get_var PONT_TRUSTED_ORIGINS)"
  case ",$origins," in *",https://$dash_domain,"*) ;; *) force_var PONT_TRUSTED_ORIGINS "${origins:+$origins,}https://$dash_domain" ;; esac
  # Services internes joignables seulement depuis la machine : le proxy est le seul point d'entrée public.
  force_var PONT_BIND 127.0.0.1
  force_var DASHBOARD_BIND 127.0.0.1
  profiles="${profiles:+$profiles,}prod"

  # Mode live : jamais sans confirmation explicite, jamais avec le sandbox.
  if [ "$(get_var PONT_MODE)" != "live" ]; then
    confirm="${PONT_CONFIRM_LIVE:-}"
    if [ -z "$confirm" ] && [ -t 0 ]; then
      read -r -p "Passer en mode LIVE (vrais paiements) ? Tapez LIVE pour confirmer, Entrée pour rester en test : " confirm
    fi
    if [ "$confirm" = "LIVE" ]; then
      [ "$(get_var PONT_SANDBOX)" != "true" ] || force_var PONT_SANDBOX false
      force_var PONT_MODE live
      echo "Mode live activé : sandbox désactivé."
    else
      echo "Mode test conservé. Pour le live : PONT_CONFIRM_LIVE=LIVE ./setup.sh --prod"
    fi
  fi
  if [ "$(get_var PONT_MODE)" = "live" ] && [ "$(get_var PONT_SANDBOX)" = "true" ]; then
    echo "Refus : PONT_MODE=live avec PONT_SANDBOX=true. Mettez PONT_SANDBOX=false dans .env." >&2; exit 1
  fi
else
  # Retour au développement : ports ouverts sur la machine comme avant.
  force_var PONT_BIND 0.0.0.0
  force_var DASHBOARD_BIND 0.0.0.0
fi
force_var COMPOSE_PROFILES "$profiles"
echo "Secrets générés dans .env (non affichés). Stockage : $store. Mode : $([ "$prod" = true ] && echo production || echo développement)."

if [ "$store" = "convex" ]; then
  echo "Démarrage du backend Convex…"
  docker compose up -d --wait backend
  if ! grep -qE "^CONVEX_SELF_HOSTED_ADMIN_KEY=.+" .env; then
    key="$(docker compose exec -T backend ./generate_admin_key.sh | tail -n 1)"
    set_var CONVEX_SELF_HOSTED_ADMIN_KEY "$key"
    echo "Clé d'administration Convex générée dans .env (non affichée)."
  fi
  echo "Déploiement du schéma Pont dans Convex…"
  docker compose --profile setup run --rm --build deploy-convex
else
  if [ -z "$(get_var DATABASE_URL)" ]; then
    echo "Démarrage de PostgreSQL…"
    docker compose up -d --wait postgres
  fi
  echo "Création des tables Pont dans PostgreSQL…"
  docker compose --profile setup run --rm --build deploy-postgres
fi

echo "Démarrage de Pont…"
docker compose up -d --build --wait

if [ "$prod" = "true" ]; then
cat <<MSG

Pont est prêt en production.
  Dashboard Pont      https://$(get_var DASHBOARD_DOMAIN)   (le premier visiteur crée le compte administrateur)
  API et webhooks     https://$(get_var PONT_DOMAIN)   (clé API et jeton admin : voir .env ; /admin n'est pas public)

À faire avant d'accepter de vrais paiements :
  - DNS : les deux domaines doivent pointer vers ce serveur (enregistrements A/AAAA), ports 80 et 443 ouverts, rien d'autre.
  - Sauvegardez .env (en particulier PONT_ENCRYPTION_KEY) hors du serveur : sans elle, les clés d'agrégateurs saisies dans le dashboard sont perdues.
  - Déclarez https://$(get_var PONT_DOMAIN)/hooks/<agrégateur> chez chaque agrégateur.
MSG
else
cat <<MSG

Pont est prêt.
  Dashboard Pont      http://localhost:3300   (le premier visiteur crée le compte administrateur)
  API Pont            http://localhost:8787   (clé API et jeton admin : voir .env)
MSG
fi
if [ "$store" = "convex" ]; then
  echo "  Dashboard Convex    http://localhost:6791   (clé d'administration : CONVEX_SELF_HOSTED_ADMIN_KEY dans .env)"
fi
if [ "$prod" != "true" ]; then
cat <<'MSG'

Test rapide (sandbox) :
  TOKEN=$(grep '^PONT_ADMIN_TOKEN=' .env | cut -d= -f2 | tr -d '"')
  curl -s -X POST localhost:8787/admin/test-payment -H "authorization: Bearer $TOKEN" -d '{}'
MSG
fi
