#!/usr/bin/env bash
#
# Migration replay test for the auth and TV pairing templates: npm run test:db
#
# For each variant in fixtures/ (fresh: no profiles table; quiz: Quiz Night's
# profiles keyed by user_id with a text role; cash: Cash Bingo's profiles keyed
# by id with an enum role), on a throwaway Postgres with Supabase stubs:
#   1. apply the variant's own pre-existing schema (fixtures/<variant>/*.sql),
#   2. apply the kit templates rendered by src/auth/sql/print.js, plus the
#      active_staff_gate on the variant's app table, then the TV pairing
#      templates from src/pairing/sql/print.js,
#   3. run checks.sh as anon, pending, host, admin, a banned host, a
#      deactivated host, a user with no profile, the service role and the
#      Auth hook role, then checks-pairing.sh for TV pairing.
# Nothing here touches a real Supabase project.
#
# Locally, with no PGHOST set, it makes its own cluster with initdb on
# TEST_DB_PORT (default 54421) and removes it after; it needs Postgres 17
# binaries on PATH. In CI, PGHOST (PGPORT, PGUSER, PGPASSWORD) point at a
# Postgres 17 service container.
#
# Exit codes: 0 every variant applied and every check passed, 1 otherwise.

set -u -o pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
VARIANTS="${VARIANTS:-fresh quiz cash}"

TMP_CLUSTER=""
cleanup() {
  if [ -n "$TMP_CLUSTER" ]; then
    pg_ctl -D "$TMP_CLUSTER/data" -m fast stop >/dev/null 2>&1
    rm -rf "$TMP_CLUSTER"
  fi
}
trap cleanup EXIT

if [ -z "${PGHOST:-}" ]; then
  if [ -z "${LC_ALL:-}" ]; then
    if locale -a 2>/dev/null | grep -qi '^en_GB\.utf-\?8$'; then export LC_ALL=en_GB.UTF-8; else export LC_ALL=C; fi
  fi
  for bin in initdb pg_ctl psql; do
    command -v "$bin" >/dev/null || { echo "test:db needs $bin on PATH (Postgres 17)"; exit 1; }
  done
  TMP_CLUSTER="$(mktemp -d "${TMPDIR:-/tmp}/kit-auth-replay.XXXXXX")"
  PORT="${TEST_DB_PORT:-54421}"
  if command -v lsof >/dev/null && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $PORT is already in use; set TEST_DB_PORT to a free one"; exit 1
  fi
  initdb -D "$TMP_CLUSTER/data" -U postgres -A trust >"$TMP_CLUSTER/initdb.log" 2>&1 \
    || { cat "$TMP_CLUSTER/initdb.log"; exit 1; }
  pg_ctl -D "$TMP_CLUSTER/data" -o "-p $PORT -c unix_socket_directories=''" \
    -l "$TMP_CLUSTER/server.log" -w start >/dev/null \
    || { cat "$TMP_CLUSTER/server.log"; exit 1; }
  export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres
else
  command -v psql >/dev/null || { echo "test:db needs psql on PATH"; exit 1; }
fi

export PGCONNECT_TIMEOUT=10
p() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
echo "server: $(p -d postgres -At -c 'show server_version')"

p -d postgres -c "
  do \$\$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit; end if;
  end \$\$;
  grant anon, authenticated, service_role to authenticator;" || exit 1

failed=0
for variant in $VARIANTS; do
  dir="$HERE/fixtures/$variant"
  profile_id="$(cat "$dir/profile-id")"
  gate_table="$(cat "$dir/gate-table")"
  db="kit_auth_$variant"
  echo "==== variant $variant (profiles key: $profile_id)"
  p -d postgres -c "drop database if exists $db" -c "create database $db" || exit 1
  p -d "$db" -f "$HERE/supabase-stubs.sql" || exit 1

  for f in $(ls "$dir"/*.sql 2>/dev/null | LC_ALL=C sort); do
    p -d "$db" --single-transaction -f "$f" || { echo "FAIL  fixture $(basename "$f")"; failed=1; continue 2; }
  done

  out="$(mktemp -d "${TMPDIR:-/tmp}/kit-auth-sql.XXXXXX")"
  node "$ROOT/src/auth/sql/print.js" --profile-id "$profile_id" --gate "$gate_table" \
    --out "$out" --timestamp 20261110120000 >/dev/null || { echo "FAIL  render"; failed=1; continue; }
  # The pairing templates come after the auth ones, as they must in an app.
  node "$ROOT/src/pairing/sql/print.js" --out "$out" --timestamp 20261112120000 >/dev/null \
    || { echo "FAIL  render pairing"; failed=1; continue; }
  applied=0
  for f in $(ls "$out"/*.sql | LC_ALL=C sort); do
    if ! res="$(p -d "$db" --single-transaction -f "$f" 2>&1)"; then
      echo "FAIL  replay stopped at $(basename "$f")"; echo "$res" | head -20; failed=1; continue 2
    fi
    applied=$((applied + 1))
  done
  # Applying twice must be harmless: a re-run after a partial failure.
  for f in $(ls "$out"/*.sql | LC_ALL=C sort); do
    if ! res="$(p -d "$db" --single-transaction -f "$f" 2>&1)"; then
      echo "FAIL  second apply of $(basename "$f")"; echo "$res" | head -20; failed=1; continue 2
    fi
  done
  rm -rf "$out"
  echo "applied $applied kit migrations (twice)"

  TEST_DB_NAME="$db" PROFILE_ID="$profile_id" GATE_TABLE="$gate_table" VARIANT="$variant" \
    bash "$HERE/checks.sh" || failed=1
  TEST_DB_NAME="$db" PROFILE_ID="$profile_id" VARIANT="$variant" \
    bash "$HERE/checks-pairing.sh" || failed=1
done

[ "$failed" -eq 0 ]
