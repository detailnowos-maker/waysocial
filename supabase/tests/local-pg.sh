#!/usr/bin/env bash
# Postgres 16 descartável para validar migrations/RLS sem Docker.
#   supabase/tests/local-pg.sh up      → cria cluster em /tmp/waysocial-pg, aplica stubs + migrations (+ seed.sql se existir)
#   supabase/tests/local-pg.sh down    → para e apaga
#   supabase/tests/local-pg.sh psql …  → psql como superusuário no banco `waysocial`
# Roda como root (ambientes de CI/containers) usando o usuário `postgres` do sistema.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
DATA=/tmp/waysocial-pg
SOCK=/tmp/waysocial-pg-sock
PORT="${WAYSOCIAL_PG_PORT:-54329}"

as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
sql() { as_pg "$PGBIN/psql" -h "$SOCK" -p "$PORT" -v ON_ERROR_STOP=1 -q "$@"; }

case "${1:-}" in
  up)
    "$0" down >/dev/null 2>&1 || true
    mkdir -p "$SOCK" && chmod 777 "$SOCK"
    as_pg "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
    as_pg "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=127.0.0.1 -c fsync=off" -l "$DATA/log" -w start >/dev/null
    as_pg "$PGBIN/createdb" -h "$SOCK" -p "$PORT" -U postgres waysocial
    sql -U postgres -d waysocial -f "$ROOT/supabase/tests/00_supabase_stubs.sql"
    for f in "$ROOT"/supabase/migrations/*.sql; do echo "→ $(basename "$f")"; sql -U postgres -d waysocial -f "$f"; done
    if [ -f "$ROOT/supabase/seed.sql" ] && [ "${SKIP_SEED:-0}" != 1 ]; then echo "→ seed.sql"; sql -U postgres -d waysocial -f "$ROOT/supabase/seed.sql"; fi
    echo "Postgres pronto em 127.0.0.1:$PORT (socket $SOCK), banco waysocial"
    ;;
  down)
    as_pg "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$DATA" "$SOCK"
    ;;
  psql)
    shift; sql -U postgres -d waysocial "$@"
    ;;
  *) echo "uso: $0 up|down|psql" >&2; exit 2 ;;
esac
