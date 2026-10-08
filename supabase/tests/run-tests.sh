#!/usr/bin/env bash
# Sobe um Postgres limpo, aplica as migrations e roda os testes de privacidade/RLS.
set -euo pipefail
cd "$(dirname "$0")/../.."
SKIP_SEED=1 supabase/tests/local-pg.sh up >/dev/null
trap 'supabase/tests/local-pg.sh down >/dev/null 2>&1 || true' EXIT
supabase/tests/local-pg.sh psql -f supabase/tests/10_privacy_rls.sql 2>&1
