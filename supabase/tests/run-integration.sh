#!/usr/bin/env bash
# Teste de integração do SupabaseRepository contra Postgres REAL + PostgREST (a mesma camada HTTP do Supabase).
#   1. sobe Postgres 16 descartável, aplica migrations + seed
#   2. sobe o PostgREST (baixa o binário se necessário)
#   3. roda scripts/supabase-integration.mts (JWTs assinados localmente, um por usuário)
set -euo pipefail
cd "$(dirname "$0")/../.."
PGREST_VERSION="${PGREST_VERSION:-12.2.3}"
BIN_DIR="${PGREST_BIN_DIR:-/tmp/waysocial-postgrest}"
PGREST_PORT="${PGREST_PORT:-54330}"
SECRET="waysocial-local-test-secret-0123456789abcdef"

if [ ! -x "$BIN_DIR/postgrest" ]; then
  mkdir -p "$BIN_DIR"
  echo "baixando PostgREST $PGREST_VERSION…"
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/v${PGREST_VERSION}/postgrest-v${PGREST_VERSION}-linux-static-x64.tar.xz" | tar -xJ -C "$BIN_DIR"
fi

supabase/tests/local-pg.sh up >/dev/null
cleanup() { [ -n "${PGREST_PID:-}" ] && kill "$PGREST_PID" 2>/dev/null || true; supabase/tests/local-pg.sh down >/dev/null 2>&1 || true; }
trap cleanup EXIT

cat > /tmp/waysocial-postgrest.conf <<CONF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:${WAYSOCIAL_PG_PORT:-54329}/waysocial"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = $PGREST_PORT
db-max-rows = 1000
CONF
"$BIN_DIR/postgrest" /tmp/waysocial-postgrest.conf >/tmp/waysocial-postgrest.log 2>&1 &
PGREST_PID=$!
for _ in $(seq 1 40); do curl -fs "http://127.0.0.1:$PGREST_PORT/" >/dev/null 2>&1 && break; sleep 0.25; done

PGREST_URL="http://127.0.0.1:$PGREST_PORT" JWT_SECRET="$SECRET" npx tsx scripts/supabase-integration.mts
