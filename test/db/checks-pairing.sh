#!/usr/bin/env bash
#
# Behaviour checks for the TV pairing templates on one replayed variant, run
# by run.sh after checks.sh. As there, every act-as query runs inside a
# transaction that is rolled back unless the check needs the row later, and
# fixtures are made as the database owner.

set -u -o pipefail

DB="$TEST_DB_NAME"
PID="$PROFILE_ID"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

q() { psql -X -At -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1; }
as_anon() { q -c "begin; set local role anon; $1; rollback;"; }
as_user() { q -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$1'; $2; rollback;"; }
as_service() { q -c "begin; set local role service_role; $1; rollback;"; }
as_service_commit() { q -c "begin; set local role service_role; $1; commit;"; }

fails=0
check() {
  if [ "$2" = "$3" ]; then echo "PASS  $1: $2"
  else echo "FAIL  $1: got '$2', want '$3'"; fails=$((fails + 1)); fi
}
refused() {
  if printf '%s' "$2" | grep -qF -- "$3"; then echo "PASS  $1: refused ($3)"
  else echo "FAIL  $1: not refused, got '$(printf '%s' "$2" | head -1)'"; fails=$((fails + 1)); fi
}

# sha256 hex of a value, as the kit's sha256Hex computes it.
h() { printf "encode(extensions_sha256('%s'), 'hex')" "$1"; }
q -c "create or replace function public.extensions_sha256(v text) returns bytea language sql immutable as \$\$ select sha256(convert_to(v, 'UTF8')) \$\$;
      revoke all on function public.extensions_sha256(text) from public, anon, authenticated;" >/dev/null

mkuser() {
  local id
  id=$(q -c "insert into auth.users (email) values ('$1') returning id")
  q -c "insert into public.profiles ($PID) values ('$id') on conflict ($PID) do nothing" >/dev/null
  echo "$id"
}
T_HOST=$(mkuser tv-host@example.com)
T_HOST2=$(mkuser tv-host2@example.com)
T_ADMIN=$(mkuser tv-admin@example.com)
T_PENDING=$(mkuser tv-pending@example.com)
T_GONE=$(mkuser tv-gone@example.com)
q -c "update public.profiles set role = 'host' where $PID in ('$T_HOST', '$T_HOST2', '$T_GONE');
      update public.profiles set role = 'admin' where $PID = '$T_ADMIN';
      update public.profiles set deactivated_at = now() where $PID = '$T_GONE';" >/dev/null
if [ -z "$T_HOST" ] || [ -z "$T_ADMIN" ]; then echo "FAIL  pairing fixtures could not be made"; exit 1; fi

issue() { # code secret ip [previous]
  local prev="null"
  [ -n "${4:-}" ] && prev="$(h "$4")"
  as_service_commit "select (public.kit_tv_issue_code($(h "$1"), $(h "$2"), '$3', $prev) > now())::text"
}
pair() { # code user ip [name]
  as_service_commit "select public.kit_tv_pair($(h "$1"), '${4:-Bar TV}', '$2', '$3')"
}
claim() { # secret token
  as_service_commit "select status || ':' || coalesce(device_name, '') from public.kit_tv_claim($(h "$1"), $(h "$2"))"
}
unthrottle() { q -c "update public.tv_pairing_codes set last_polled_at = now() - interval '2 seconds'" >/dev/null; }

echo "-- pairing tables are closed to the API roles"
for t in tv_devices tv_pairing_codes tv_pairing_attempts; do
  refused "anon reads $t" "$(as_anon "select count(*) from public.$t")" "permission denied"
  refused "anon writes $t" "$(as_anon "insert into public.$t default values")" "permission denied"
  refused "admin reads $t" "$(as_user "$T_ADMIN" "select count(*) from public.$t")" "permission denied"
  refused "host writes $t" "$(as_user "$T_HOST" "delete from public.$t")" "permission denied"
done
for fn in "kit_tv_issue_code('a', 'b', null)" "kit_tv_pair('a', 'TV', null, null)" "kit_tv_claim('a', 'b')" \
          "kit_tv_device_seen('a')" "kit_tv_list_devices()" "kit_tv_revoke(gen_random_uuid(), null)" "kit_tv_prune_pairing()"; do
  refused "anon calls ${fn%%(*}" "$(as_anon "select public.$fn")" "permission denied"
  refused "admin calls ${fn%%(*}" "$(as_user "$T_ADMIN" "select public.$fn")" "permission denied"
done
check "pairing tables with row level security off" \
  "$(q -c "select count(*) from pg_class where oid in ('public.tv_devices'::regclass, 'public.tv_pairing_codes'::regclass, 'public.tv_pairing_attempts'::regclass) and not relrowsecurity")" 0

echo "-- the happy path"
check "a TV gets a code" "$(issue 123456 secret-a 203.0.113.1)" true
check "the code is stored hashed, never as digits" "$(q -c "select count(*) from public.tv_pairing_codes where code_hash = '123456' or secret_hash = 'secret-a'")" 0
check "the TV waits" "$(claim secret-a token-a)" "waiting:"
check "a second poll within a second is told to slow down" "$(claim secret-a token-a)" "slow_down:"
check "a host types the code" "$(pair 123456 "$T_HOST" 198.51.100.1)" paired
unthrottle
check "the TV's next poll pairs it" "$(claim secret-a token-a)" "paired:Bar TV"
check "the device stores only the token hash" "$(q -c "select count(*) from public.tv_devices where token_hash = $(h token-a) and created_by = '$T_HOST'")" 1
check "the code is single use: typing it again is wrong" "$(pair 123456 "$T_HOST2" 198.51.100.2)" wrong
unthrottle
check "the pairing secret cannot claim twice" "$(claim secret-a token-b)" "unknown:"
check "a token that was never issued finds nothing" "$(as_service "select count(*) from public.kit_tv_device_seen($(h nobody))")" 0
check "the device is seen" "$(as_service_commit "select name from public.kit_tv_device_seen($(h token-a))")" "Bar TV"
q -c "update public.tv_devices set last_seen_at = now() - interval '30 seconds' where token_hash = $(h token-a)" >/dev/null
as_service_commit "select 1 from public.kit_tv_device_seen($(h token-a))" >/dev/null
check "last_seen_at moves at most once a minute" \
  "$(q -c "select (last_seen_at < now() - interval '20 seconds')::text from public.tv_devices where token_hash = $(h token-a)")" true
q -c "update public.tv_devices set last_seen_at = now() - interval '2 minutes' where token_hash = $(h token-a)" >/dev/null
as_service_commit "select 1 from public.kit_tv_device_seen($(h token-a))" >/dev/null
check "and moves after a minute" \
  "$(q -c "select (last_seen_at > now() - interval '5 seconds')::text from public.tv_devices where token_hash = $(h token-a)")" true

echo "-- who may pair"
check "issue a code for the staff checks" "$(issue 222222 secret-s 203.0.113.2)" true
refused "a pending user cannot pair" "$(pair 222222 "$T_PENDING" 198.51.100.3)" "kit_tv_not_staff"
refused "a deactivated host cannot pair" "$(pair 222222 "$T_GONE" 198.51.100.3)" "kit_tv_not_staff"
refused "a user with no account cannot pair" "$(pair 222222 "$(q -c "select gen_random_uuid()")" 198.51.100.3)" "kit_tv_not_staff"
refused "a name that is too long" "$(pair 222222 "$T_HOST" 198.51.100.3 "$(printf 'x%.0s' {1..41})")" "kit_tv_invalid_name"
refused "a blank name" "$(pair 222222 "$T_HOST" 198.51.100.3 '   ')" "kit_tv_invalid_name"
check "the refusals did not use the code up" "$(q -c "select status from public.tv_pairing_codes where secret_hash = $(h secret-s)")" waiting
check "an admin may pair" "$(pair 222222 "$T_ADMIN" 198.51.100.3 'Lounge TV')" paired
q -c "update public.profiles set deactivated_at = now() where $PID = '$T_ADMIN'" >/dev/null
unthrottle
check "an approval by someone deactivated since is not claimed" "$(claim secret-s token-s)" "expired:"
q -c "update public.profiles set deactivated_at = null where $PID = '$T_ADMIN'" >/dev/null

echo "-- expiry"
check "issue a code to expire" "$(issue 333333 secret-e 203.0.113.3)" true
q -c "update public.tv_pairing_codes set created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where secret_hash = $(h secret-e)" >/dev/null
check "an expired code is wrong" "$(pair 333333 "$T_HOST2" 198.51.100.4)" wrong
check "and the TV is told to ask again" "$(claim secret-e token-e)" "expired:"
refused "a code longer than 10 minutes" "$(as_service "select public.kit_tv_issue_code($(h 444444), $(h secret-x), null, null, 601)")" "kit_invalid_ttl"
refused "a code row written directly for longer than 10 minutes" \
  "$(as_service "insert into public.tv_pairing_codes (code_hash, secret_hash, expires_at) values ($(h 1), $(h 2), now() + interval '11 minutes')")" "violates check constraint"
refused "a device row with a raw token" \
  "$(as_service "insert into public.tv_devices (name, token_hash, created_by) values ('TV', 'raw-token', '$T_HOST')")" "violates check constraint"
check "asking again replaces the old code" "$(issue 555555 secret-r2 203.0.113.4)" true
check "a replacement" "$(issue 666666 secret-r3 203.0.113.4 secret-r2)" true
check "the replaced code cannot be typed" "$(pair 555555 "$T_HOST2" 198.51.100.5)" wrong
unthrottle
check "and its secret is unknown" "$(claim secret-r2 token-r2)" "unknown:"
refused "a live code cannot be shown on two screens" "$(issue 666666 secret-dup 203.0.113.5)" "kit_tv_code_collision"

echo "-- brute force"
check "issue a code to guard" "$(issue 777777 secret-b 203.0.113.6)" true
q -c "update public.tv_pairing_codes set wrong_attempts = 0 where status = 'waiting'; delete from public.tv_pairing_attempts;" >/dev/null
for n in 1 2 3 4; do pair 000001 "$T_HOST2" "192.0.2.$n" >/dev/null; done
check "a fifth wrong attempt from the same host is still answered" "$(pair 000005 "$T_HOST2" 192.0.2.5)" wrong
check "every live code is burnt after 5 wrong attempts" "$(q -c "select status from public.tv_pairing_codes where secret_hash = $(h secret-b)")" burnt
check "so even the right code no longer works" "$(pair 777777 "$T_HOST" 198.51.100.6)" wrong
unthrottle
check "and the TV asks for a new code" "$(claim secret-b token-b2)" "expired:"
refused "the host is locked after 5 wrong attempts, from any IP" "$(pair 000006 "$T_HOST2" 192.0.2.99)" "kit_tv_pair_locked"
q -c "delete from public.tv_pairing_attempts" >/dev/null
for n in 1 2 3 4 5; do
  q -c "insert into public.tv_pairing_attempts (user_id, ip, outcome) values (gen_random_uuid(), '192.0.2.200', 'wrong')" >/dev/null
done
refused "an IP is locked after 5 wrong attempts by anyone" "$(pair 000007 "$T_HOST" 192.0.2.200)" "kit_tv_pair_locked"
q -c "update public.tv_pairing_attempts set occurred_at = now() - interval '16 minutes'" >/dev/null
check "the lock lifts after 15 minutes" "$(pair 000008 "$T_HOST" 192.0.2.200)" wrong
q -c "delete from public.tv_pairing_attempts; update public.tv_pairing_codes set created_at = now() - interval '20 minutes', expires_at = now() - interval '10 minutes' where status = 'waiting';" >/dev/null
for n in 1 2 3 4 5 6 7 8 9 10; do issue "88880$((n % 10))$n" "secret-ip-$n" 203.0.113.250 >/dev/null; done
refused "an IP may ask for 10 codes in 10 minutes, no more" "$(issue 999999 secret-ip-11 203.0.113.250)" "kit_tv_code_rate_limited"
q -c "update public.tv_pairing_codes set poll_count = 400, last_polled_at = null where secret_hash = $(h secret-ip-1)" >/dev/null
check "a code polled 400 times expires" "$(claim secret-ip-1 token-ip-1)" "expired:"

echo "-- revoke"
DEVICE=$(q -c "select id from public.tv_devices where token_hash = $(h token-a)")
refused "a host cannot revoke" "$(as_service "select public.kit_tv_revoke('$DEVICE', '$T_HOST')")" "kit_tv_not_admin"
refused "a deactivated admin cannot revoke" \
  "$(q -c "begin; update public.profiles set deactivated_at = now() where $PID = '$T_ADMIN'; set local role service_role; select public.kit_tv_revoke('$DEVICE', '$T_ADMIN'); rollback;")" "kit_tv_not_admin"
check "the admin list shows the live device" "$(as_service "select name || ':' || created_by_email from public.kit_tv_list_devices() where id = '$DEVICE'")" "Bar TV:tv-host@example.com"
check "an admin revokes it" "$(as_service_commit "select public.kit_tv_revoke('$DEVICE', '$T_ADMIN')")" "Bar TV"
check "revoking twice finds nothing" "$(as_service "select coalesce(public.kit_tv_revoke('$DEVICE', '$T_ADMIN'), 'none')")" none
check "a revoked device is refused" "$(as_service "select count(*) from public.kit_tv_device_seen($(h token-a))")" 0
check "the admin list leaves it out" "$(as_service "select count(*) from public.kit_tv_list_devices() where id = '$DEVICE'")" 0
check "unless asked for revoked ones too" "$(as_service "select (revoked_at is not null)::text from public.kit_tv_list_devices(true) where id = '$DEVICE'")" true

echo "-- clean-up"
q -c "update public.tv_pairing_codes set created_at = now() - interval '2 days', expires_at = now() - interval '2 days' + interval '5 minutes';
      insert into public.tv_pairing_attempts (user_id, ip, outcome, occurred_at) values (null, '192.0.2.1', 'wrong', now() - interval '31 days');
      update public.tv_devices set revoked_at = now() - interval '13 months' where id = '$DEVICE';" >/dev/null
check "prune removes old codes, attempts and long-revoked devices" \
  "$(as_service_commit "select ((r ->> 'codes')::int > 0)::text || ':' || (r ->> 'attempts') || ':' || (r ->> 'revoked_devices') from public.kit_tv_prune_pairing() r")" "true:1:1"
check "no pairing code is left" "$(q -c "select count(*) from public.tv_pairing_codes")" 0

q -c "drop function public.extensions_sha256(text)" >/dev/null

echo "-- the templates refuse to run before the auth ones"
NOAUTH="${DB}_noauth"
psql -X -q -d postgres -c "drop database if exists $NOAUTH" -c "create database $NOAUTH" >/dev/null 2>&1
psql -X -q -d "$NOAUTH" -f "$HERE/supabase-stubs.sql" >/dev/null 2>&1
first="$(node --input-type=module -e "import('$ROOT/src/pairing/sql/index.js').then((m) => process.stdout.write(m.renderPairingMigrations()[0].sql))")"
refused "pairing 01 without auth" "$(printf '%s' "$first" | psql -X -q -v ON_ERROR_STOP=1 -d "$NOAUTH" 2>&1)" "apply the kit auth migrations first"
psql -X -q -d postgres -c "drop database if exists $NOAUTH" >/dev/null 2>&1

echo "pairing failures: $fails"
[ "$fails" -eq 0 ]
