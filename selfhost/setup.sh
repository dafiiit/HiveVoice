#!/usr/bin/env bash
# Makes this computer a HiveVoice server: writes the settings (.env, with fresh secrets), builds or fetches the app, sets up
# the database and starts everything. Running it again updates the server and keeps the data (selfhost/data/).
#
#   ./setup.sh                                      asks what it needs to know
#   ./setup.sh --mode local --admin me@example.org  on this computer and in the home network
#   ./setup.sh --mode tailscale --ts-authkey tskey-auth-…
#   ./setup.sh --mode cloudflare --cf-token … --public-url https://hv.example.org
#   ./setup.sh --mode domain --domain hv.example.org   (ports 80 and 443 forwarded to this computer)
#
# Other switches: --image ghcr.io/…/hivevoice:latest (use a built image instead of building here), --no-regions (do not
# load the German municipalities and postcodes from OpenPLZ; done once by default, about half a minute), --yes (ask
# nothing), --status, --stop.
set -euo pipefail
cd "$(dirname "$0")"

MODE="" DOMAIN="" TS_KEY="" CF_TOKEN="" URL="" ADMIN="" IMAGE="" REGIONS=1 YES=0 ACTION=setup
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --ts-authkey) TS_KEY="$2"; shift 2 ;;
    --cf-token) CF_TOKEN="$2"; shift 2 ;;
    --public-url) URL="$2"; shift 2 ;;
    --admin) ADMIN="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --regions) REGIONS=1; shift ;;
    --no-regions) REGIONS=0; shift ;;
    --yes|-y) YES=1; shift ;;
    --status) ACTION=status; shift ;;
    --stop) ACTION=stop; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unbekannter Schalter: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask VAR "Frage" "Vorgabe"
  local cur="${!1}"
  [ -n "$cur" ] && return
  if [ "$YES" = 1 ]; then printf -v "$1" '%s' "$3"; return; fi
  read -r -p "$2 ${3:+[$3] }" answer
  printf -v "$1" '%s' "${answer:-$3}"
}
setting() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- ; }
put() { # put KEY VALUE: writes or replaces a line in .env
  if grep -qE "^$1=" .env 2>/dev/null; then
    local tmp; tmp="$(mktemp)"; grep -vE "^$1=" .env > "$tmp"; mv "$tmp" .env
  fi
  printf '%s=%s\n' "$1" "$2" >> .env
}
random() { openssl rand -hex "${1:-24}"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
# A login token signed with the instance's secret, for Supabase's roles "anon" and "service_role" (valid for 10 years).
jwt() {
  local now; now=$(date +%s)
  local head; head=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  local body; body=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$now" $((now + 315360000)) | b64url)
  local sig; sig=$(printf '%s.%s' "$head" "$body" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$head" "$body" "$sig"
}
compose() {
  local profiles=()
  case "$(setting MODE)" in tailscale) profiles=(--profile tailscale) ;; cloudflare) profiles=(--profile cloudflare) ;; esac
  # (written so that the old bash of macOS, 3.2, accepts an empty list)
  docker compose ${profiles[@]+"${profiles[@]}"} "$@"
}

command -v docker >/dev/null || fail "Docker fehlt. Installieren: https://docs.docker.com/get-docker/ (Raspberry Pi: curl -fsSL https://get.docker.com | sh)"
docker compose version >/dev/null 2>&1 || fail "Docker Compose fehlt (docker compose plugin)."
docker info >/dev/null 2>&1 || fail "Docker läuft nicht (Docker Desktop starten, oder: sudo systemctl start docker)."

if [ "$ACTION" = status ]; then compose ps; exit 0; fi
if [ "$ACTION" = stop ]; then compose stop; say "HiveVoice ist angehalten. Die Daten bleiben erhalten (selfhost/data und das Docker-Volume für Dateien)."; exit 0; fi

# ── Settings ────────────────────────────────────────────────────────────────────────────────────────────────────────────
touch .env && chmod 600 .env
[ -z "$MODE" ] && MODE="$(setting MODE)"
if [ -z "$MODE" ]; then
  say "Wie sollen andere deinen Server erreichen?"
  echo "  1) local       nur auf diesem Rechner und im eigenen Netz (WLAN)"
  echo "  2) tailscale   von überall, ohne Router-Einstellungen (kostenloses Tailscale-Konto)"
  echo "  3) cloudflare  von überall über einen Cloudflare-Tunnel (eigene Domain bei Cloudflare)"
  echo "  4) domain      eigene Domain, Ports 80 und 443 im Router an diesen Rechner weitergeleitet"
  ask CHOICE "Auswahl:" "1"
  case "$CHOICE" in 2|tailscale) MODE=tailscale ;; 3|cloudflare) MODE=cloudflare ;; 4|domain) MODE=domain ;; *) MODE=local ;; esac
fi
case "$MODE" in local|tailscale|cloudflare|domain) ;; *) fail "--mode: local, tailscale, cloudflare oder domain" ;; esac
put MODE "$MODE"

# Secrets: made once, kept on every later run (changing them would sign everyone out or let people vote again).
for key in POSTGRES_PASSWORD APP_DB_PASSWORD BALLOT_SECRET CRON_SECRET; do [ -n "$(setting $key)" ] || put "$key" "$(random)"; done
[ -n "$(setting JWT_SECRET)" ] || put JWT_SECRET "$(random 32)"
SECRET="$(setting JWT_SECRET)"
[ -n "$(setting ANON_KEY)" ] || put ANON_KEY "$(jwt anon "$SECRET")"
[ -n "$(setting SERVICE_ROLE_KEY)" ] || put SERVICE_ROLE_KEY "$(jwt service_role "$SECRET")"

[ -z "$ADMIN" ] && ADMIN="$(setting ADMIN_EMAILS)"
ask ADMIN "E-Mail-Adresse der ersten Admin-Person (sie meldet sich danach damit an):" ""
put ADMIN_EMAILS "$ADMIN"
[ -n "$IMAGE" ] && put HIVEVOICE_IMAGE "$IMAGE"

case "$MODE" in
  local)
    # The address in the home network, so phones and other computers there reach it too.
    ip="$( (ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}') | head -1)"
    [ -z "$URL" ] && URL="http://${ip:-localhost}:8080"
    put SITE_ADDRESS ":80"; put HTTP_PORT "8080"; put HTTPS_PORT "8443" ;;
  tailscale)
    [ -z "$TS_KEY" ] && TS_KEY="$(setting TS_AUTHKEY)"
    ask TS_KEY "Tailscale-Auth-Key (https://login.tailscale.com/admin/settings/keys, \"Reusable\" an):" ""
    [ -n "$TS_KEY" ] || fail "Ohne Auth-Key geht Tailscale nicht."
    put TS_AUTHKEY "$TS_KEY"; put SITE_ADDRESS ":80"; put HTTP_PORT "8080"; put HTTPS_PORT "8443" ;;
  cloudflare)
    [ -z "$CF_TOKEN" ] && CF_TOKEN="$(setting CF_TUNNEL_TOKEN)"
    ask CF_TOKEN "Token des Cloudflare-Tunnels:" ""
    [ -z "$URL" ] && URL="$(setting PUBLIC_URL)"
    ask URL "Öffentliche Adresse des Tunnels (https://…):" ""
    [ -n "$CF_TOKEN" ] && [ -n "$URL" ] || fail "Tunnel-Token und Adresse sind nötig."
    put CF_TUNNEL_TOKEN "$CF_TOKEN"; put SITE_ADDRESS ":80"; put HTTP_PORT "8080"; put HTTPS_PORT "8443" ;;
  domain)
    [ -z "$DOMAIN" ] && DOMAIN="$(setting SITE_ADDRESS | grep -v '^:' || true)"
    ask DOMAIN "Domain (z. B. hv.example.org, zeigt per DNS auf diese Internetadresse):" ""
    [ -n "$DOMAIN" ] || fail "Ohne Domain geht dieser Weg nicht."
    URL="https://$DOMAIN"; put SITE_ADDRESS "$DOMAIN"; put HTTP_PORT "80"; put HTTPS_PORT "443" ;;
esac

mkdir -p data/db data/storage data/caddy data/tailscale

# ── The app ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
if [ -n "$(setting HIVEVOICE_IMAGE)" ]; then
  say "Lade die App ($(setting HIVEVOICE_IMAGE)) …"; compose pull app
else
  say "Baue die App (beim ersten Mal 5 bis 20 Minuten, auf einem Raspberry Pi länger) …"; compose build app
fi

# ── Address (Tailscale tells it only once the machine is in the tailnet) ───────────────────────────────────────────────
if [ "$MODE" = tailscale ]; then
  put PUBLIC_URL "http://placeholder"
  compose up -d tailscale
  say "Warte auf Tailscale …"
  for _ in $(seq 1 60); do
    name="$(compose exec -T tailscale tailscale status --json 2>/dev/null | sed -n 's/.*"DNSName": *"\([^"]*\)\.".*/\1/p' | head -1)"
    [ -n "$name" ] && break; sleep 2
  done
  [ -n "${name:-}" ] || fail "Tailscale hat sich nicht gemeldet. Auth-Key prüfen und Funnel im Tailnet erlauben (Access controls → nodeAttrs \"funnel\")."
  URL="https://$name"
fi
put PUBLIC_URL "${URL%/}"

# ── Database ────────────────────────────────────────────────────────────────────────────────────────────────────────────
say "Starte Datenbank, Anmeldung und Dateien …"
compose up -d --wait db auth storage
say "Richte die Datenbank ein …"
# The app's own login first (some migrations set its limits), then the schema, then its membership in hivevoice_server,
# which the migrations make (supabase/migrations/…000_migrator.sql).
compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'hivevoice_app') then
    create role hivevoice_app login noinherit password '$(setting APP_DB_PASSWORD)';
  else
    alter role hivevoice_app login password '$(setting APP_DB_PASSWORD)';
  end if;
end \$\$;
SQL
compose run --rm --no-deps app node scripts/migrate.mjs
compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -c "grant hivevoice_server to hivevoice_app with inherit true, set true;"
# Places: everybody chooses one when starting (onboarding), so an empty list would let nobody in. Loaded once.
if [ "$REGIONS" = 1 ] && [ "$(compose exec -T db psql -U postgres -d postgres -Atc 'select count(*) from public.regions')" -lt 100 ]; then
  say "Lade Gemeinden und Postleitzahlen (OpenPLZ, etwa eine halbe Minute) …"
  compose run --rm --no-deps app node scripts/import-regions.mjs || say "Die Orte ließen sich nicht laden (kein Internet?). Später: ./setup.sh"
fi

# ── Start ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
compose up -d
say ""
say "HiveVoice läuft: $(setting PUBLIC_URL)"
echo "Melde dich dort mit ${ADMIN:-deiner Admin-Adresse} an (Registrieren) und wechsle unter Einstellungen → Ansicht auf „Verwaltung“."
echo "Daten: $(pwd)/data (sichern: ./backup.sh). Anhalten: ./setup.sh --stop. Neu starten oder aktualisieren: ./setup.sh"
