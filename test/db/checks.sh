#!/usr/bin/env bash
#
# Behaviour checks on one replayed variant, run by run.sh. Each check acts as
# the caller a real request would be. Every act-as query runs inside a
# transaction that is rolled back, so checks cannot leak into each other;
# fixtures are made as the database owner, the way Supabase Auth and the
# service role would.
#
# Zero rows is the right answer for "cannot see"; an error is the right answer
# for "cannot touch" where a grant, a trigger or a check is what stops it.

set -u -o pipefail

DB="$TEST_DB_NAME"
PID="$PROFILE_ID"
GATE="$GATE_TABLE"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

q() { psql -X -At -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1; }
as_anon() { q -c "begin; set local role anon; $1; rollback;"; }
as_user() { q -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$1'; $2; rollback;"; }
as_service() { q -c "begin; set local role service_role; $1; rollback;"; }
as_service_commit() { q -c "begin; set local role service_role; $1; commit;"; }
as_hook() { q -c "begin; set local role supabase_auth_admin; $1; rollback;"; }

fails=0
check() {
  if [ "$2" = "$3" ]; then echo "PASS  $1: $2"
  else echo "FAIL  $1: got '$2', want '$3'"; fails=$((fails + 1)); fi
}
refused() {
  if printf '%s' "$2" | grep -qF -- "$3"; then echo "PASS  $1: refused ($3)"
  else echo "FAIL  $1: not refused, got '$(printf '%s' "$2" | head -1)'"; fails=$((fails + 1)); fi
}
positive() {
  if [ "$2" -gt 0 ] 2>/dev/null; then echo "PASS  $1: $2"
  else echo "FAIL  $1: got '$2', want a positive number"; fails=$((fails + 1)); fi
}

# ---- fixtures
mkuser() {
  local id
  id=$(q -c "insert into auth.users (email) values ('$1') returning id")
  # Projects without a sign-up trigger get the profile the kit's invite flow
  # would have made; projects with one already have a pending profile.
  q -c "insert into public.profiles ($PID) values ('$id') on conflict ($PID) do nothing" >/dev/null
  echo "$id"
}
PENDING=$(mkuser pending@example.com)
HOST=$(mkuser host@example.com)
HOST2=$(mkuser host2@example.com)
ADMIN=$(mkuser admin@example.com)
BANNED=$(mkuser banned@example.com)
GONE=$(mkuser gone@example.com)
NOPROFILE=$(q -c "insert into auth.users (email) values ('noprofile@example.com') returning id")
q -c "delete from public.profiles where $PID = '$NOPROFILE'" >/dev/null
q -c "update public.profiles set role = 'host' where $PID in ('$HOST', '$HOST2', '$BANNED', '$GONE');
      update public.profiles set role = 'admin' where $PID = '$ADMIN';
      update public.profiles set deactivated_at = now() where $PID = '$GONE';
      update auth.users set banned_until = now() + interval '876000 hours' where id = '$BANNED';" >/dev/null
if [ "$VARIANT" = "quiz" ]; then
  for u in "$PENDING" "$HOST" "$BANNED" "$GONE" "$NOPROFILE"; do
    q -c "insert into public.sessions (host_id) values ('$u')" >/dev/null
  done
fi
if [ -z "$HOST" ] || [ -z "$ADMIN" ] || [ -z "$NOPROFILE" ]; then
  echo "FAIL  fixtures could not be made"; exit 1
fi

echo "-- the active-identity gate"
for who in "pending:$PENDING:f:pending" "host:$HOST:t:host" "admin:$ADMIN:t:admin" \
           "banned host:$BANNED:f:pending" "deactivated host:$GONE:f:pending" "no profile:$NOPROFILE:f:"; do
  IFS=: read -r label uid active role <<<"$who"
  check "$label is_active_staff()" "$(as_user "$uid" "select public.is_active_staff()")" "$active"
  check "$label current_staff_role()" "$(as_user "$uid" "select public.current_staff_role()")" "$role"
done
check "admin is_active_admin()" "$(as_user "$ADMIN" "select public.is_active_admin()")" t
check "host is_active_admin()" "$(as_user "$HOST" "select public.is_active_admin()")" f
check "a JWT with no user is not active staff" "$(q -c "begin; set local role authenticated; select public.is_active_staff(); rollback;")" f

echo "-- the gate on $GATE"
positive "host sees $GATE" "$(as_user "$HOST" "select count(*) from public.$GATE")"
positive "admin sees profiles" "$(as_user "$ADMIN" "select count(*) from public.profiles")"
for who in "pending:$PENDING" "banned host:$BANNED" "deactivated host:$GONE" "no profile:$NOPROFILE"; do
  label="${who%%:*}"; uid="${who#*:}"
  check "$label sees $GATE" "$(as_user "$uid" "select count(*) from public.$GATE")" 0
  check "$label sees profiles" "$(as_user "$uid" "select count(*) from public.profiles")" 0
done
# Cash Bingo's own "viewable by everyone" policy lets staff read every profile; that is the app's choice.
if [ "$VARIANT" != "cash" ]; then
  check "host sees only their own profile" "$(as_user "$HOST" "select count(*) from public.profiles where $PID <> '$HOST'")" 0
fi
if [ "$VARIANT" = "fresh" ]; then
  refused "pending writes app_notes" "$(as_user "$PENDING" "insert into public.app_notes (body) values ('x')")" "row-level security"
  check "host writes app_notes" "$(as_user "$HOST" "insert into public.app_notes (body) values ('x') returning 'ok'")" ok
fi

echo "-- profiles cannot be self-promoted, whatever the grants"
grant_all="create policy tmp_all on public.profiles for all to authenticated using (true) with check (true);
           grant select, insert, update on public.profiles to authenticated;"
refused "host promotes themselves" \
  "$(q -c "begin; $grant_all set local role authenticated; set local request.jwt.claim.sub = '$HOST';
           update public.profiles set role = 'admin' where $PID = '$HOST'; rollback;")" "changed by an admin only"
check "deactivated host clears their own deactivation (the gate hides the row)" \
  "$(q -c "begin; $grant_all set local role authenticated; set local request.jwt.claim.sub = '$GONE';
           with u as (update public.profiles set deactivated_at = null where $PID = '$GONE' returning 1) select count(*) from u; rollback;")" 0
refused "new account inserts an admin profile" \
  "$(q -c "begin; $grant_all drop policy if exists active_staff_gate on public.profiles; set local role authenticated;
           set local request.jwt.claim.sub = '$NOPROFILE';
           insert into public.profiles ($PID, role) values ('$NOPROFILE', 'admin'); rollback;")" "starts as pending"
refused "host clears their deactivated colleague, with the gate lifted" \
  "$(q -c "begin; $grant_all drop policy if exists active_staff_gate on public.profiles; set local role authenticated;
           set local request.jwt.claim.sub = '$HOST'; update public.profiles set deactivated_at = null where $PID = '$GONE'; rollback;")" \
  "changed by an admin only"
check "the service role sets a role" "$(as_service "update public.profiles set role = 'host' where $PID = '$PENDING' returning 'ok'")" ok

echo "-- kit tables are closed to the API roles"
for t in invites recovery_grants auth_audit; do
  refused "anon reads $t" "$(as_anon "select count(*) from public.$t")" "permission denied"
done
for t in invites recovery_grants; do
  refused "admin reads $t" "$(as_user "$ADMIN" "select count(*) from public.$t")" "permission denied"
done

echo "-- auth_audit is append-only"
check "service role writes an event" \
  "$(as_service_commit "insert into public.auth_audit (app, environment, event, outcome, actor_user_id) values ('kit', 'test', 'sign_out', 'success', '$HOST') returning event")" sign_out
check "admin reads events" "$(as_user "$ADMIN" "select count(*) from public.auth_audit")" 1
check "host reads no events" "$(as_user "$HOST" "select count(*) from public.auth_audit")" 0
check "banned admin-to-be reads no events" "$(as_user "$BANNED" "select count(*) from public.auth_audit")" 0
refused "admin writes an event" "$(as_user "$ADMIN" "insert into public.auth_audit (app, environment, event, outcome) values ('kit', 'test', 'sign_out', 'success')")" "permission denied"
refused "service role updates an event" "$(as_service "update public.auth_audit set outcome = 'failure'")" "permission denied"
refused "service role deletes an event" "$(as_service "delete from public.auth_audit")" "permission denied"
refused "an unknown event" "$(as_service "insert into public.auth_audit (app, environment, event, outcome) values ('kit', 'test', 'magic', 'success')")" "violates check constraint"
refused "a bare email as the pseudonym" "$(as_service "insert into public.auth_audit (app, environment, event, outcome, email_hmac) values ('kit', 'test', 'sign_in', 'failure', 'a@b.c')")" "violates check constraint"

echo "-- invites"
H1=$(printf 'a%.0s' {1..64}); H2=$(printf 'b%.0s' {1..64}); H3=$(printf 'c%.0s' {1..64}); H4=$(printf 'd%.0s' {1..64})
check "issue an invite" "$(as_service_commit "select role || ':' || cancelled from public.kit_issue_invite(' New@Example.com ', 'host', '$H1', '$ADMIN')")" "host:0"
check "issuing again cancels the older one" "$(as_service_commit "select cancelled from public.kit_issue_invite('new@example.com', 'admin', '$H2', '$ADMIN')")" 1
check "one live invite for the email" "$(q -c "select count(*) from public.invites where email = 'new@example.com' and status = 'pending'")" 1
check "the live invite carries the newer role" "$(q -c "select role from public.invites where email = 'new@example.com' and status = 'pending'")" admin
refused "an invite for an existing account" "$(as_service "select * from public.kit_issue_invite('host@example.com', 'host', '$H3', '$ADMIN')")" "kit_invite_account_exists"
refused "an invite to be pending" "$(as_service "select * from public.kit_issue_invite('x@example.com', 'pending', '$H3', '$ADMIN')")" "kit_invalid_role"
refused "an invite longer than 7 days" "$(as_service "select * from public.kit_issue_invite('x@example.com', 'host', '$H3', '$ADMIN', 604801)")" "kit_invalid_ttl"
refused "a second live invite written directly" "$(as_service "insert into public.invites (email, role, token_hash, expires_at) values ('new@example.com', 'host', '$H3', now() + interval '1 day')")" "invites_one_live_per_email"
refused "a token that is not a hash" "$(as_service "insert into public.invites (email, role, token_hash, expires_at) values ('y@example.com', 'host', 'raw-token', now() + interval '1 day')")" "violates check constraint"
check "the cancelled link cannot be claimed" "$(as_service "select count(*) from public.kit_claim_invite('$H1', gen_random_uuid())")" 0
refused "authenticated issues an invite" "$(as_user "$ADMIN" "select * from public.kit_issue_invite('z@example.com', 'host', '$H3', '$ADMIN')")" "permission denied"

ATTEMPT=$(q -c "select gen_random_uuid()")
check "the hook refuses an uninvited sign-up" \
  "$(as_hook "select public.kit_before_user_created('{\"user\":{\"email\":\"new@example.com\",\"app_metadata\":{\"provider\":\"email\"}}}'::jsonb) -> 'error' ->> 'http_code'")" 403
check "the first claim wins" "$(as_service_commit "select email from public.kit_claim_invite('$H2', '$ATTEMPT')")" "new@example.com"
check "a concurrent second claim loses" "$(as_service "select count(*) from public.kit_claim_invite('$H2', gen_random_uuid())")" 0
check "the hook lets the claimed invite through" \
  "$(as_hook "select public.kit_before_user_created('{\"user\":{\"email\":\"NEW@example.com\",\"app_metadata\":{\"provider\":\"email\"}}}'::jsonb)")" "{}"
check "the hook refuses an anonymous user even then" \
  "$(as_hook "select public.kit_before_user_created('{\"user\":{\"email\":\"new@example.com\",\"is_anonymous\":true}}'::jsonb) -> 'error' ->> 'http_code'")" 403
check "the hook refuses another provider" \
  "$(as_hook "select public.kit_before_user_created('{\"user\":{\"email\":\"new@example.com\",\"app_metadata\":{\"provider\":\"google\"}}}'::jsonb) -> 'error' ->> 'http_code'")" 403
refused "authenticated calls the hook" "$(as_user "$ADMIN" "select public.kit_before_user_created('{}'::jsonb)")" "permission denied"
refused "an invite while one is accepting" "$(as_service "select * from public.kit_issue_invite('new@example.com', 'host', '$H3', '$ADMIN')")" "kit_invite_in_progress"

NEWUSER=$(q -c "insert into auth.users (email, banned_until) values ('new@example.com', now() + interval '876000 hours') returning id")
check "attach the banned user" "$(as_service_commit "select public.kit_attach_invite_user((select id from public.invites where token_hash = '$H2'), '$ATTEMPT', '$NEWUSER')")" t
check "another attempt cannot attach" "$(as_service "select public.kit_attach_invite_user((select id from public.invites where token_hash = '$H2'), gen_random_uuid(), '$NEWUSER')")" f
check "another attempt cannot complete" "$(as_service "select public.kit_complete_invite((select id from public.invites where token_hash = '$H2'), gen_random_uuid(), '$NEWUSER')")" f
check "still banned, the linked user is not active" "$(as_user "$NEWUSER" "select public.is_active_staff()")" f
check "complete links the profile and activates" "$(as_service_commit "select public.kit_complete_invite((select id from public.invites where token_hash = '$H2'), '$ATTEMPT', '$NEWUSER')")" t
check "the profile has the invited role" "$(q -c "select role from public.profiles where $PID = '$NEWUSER'")" admin
check "the invite is active" "$(q -c "select status from public.invites where token_hash = '$H2'")" active
check "banned until the app unbans last" "$(as_user "$NEWUSER" "select public.is_active_staff()")" f
q -c "update auth.users set banned_until = null where id = '$NEWUSER'" >/dev/null
check "unbanned, the new account is active staff" "$(as_user "$NEWUSER" "select public.is_active_staff()")" t
check "complete cannot run twice" "$(as_service "select public.kit_complete_invite((select id from public.invites where token_hash = '$H2'), '$ATTEMPT', '$NEWUSER')")" f
check "an active invite cannot be claimed again" "$(as_service "select count(*) from public.kit_claim_invite('$H2', gen_random_uuid())")" 0

check "issue an invite to fail" "$(as_service_commit "select role from public.kit_issue_invite('fail@example.com', 'host', '$H3', '$ADMIN')")" host
A2=$(q -c "select gen_random_uuid()")
as_service_commit "select * from public.kit_claim_invite('$H3', '$A2')" >/dev/null
as_service_commit "select public.kit_fail_invite((select id from public.invites where token_hash = '$H3'), '$A2', 'create_user_failed')" >/dev/null
check "a failed invite is terminal" "$(q -c "select status || ':' || failure_reason from public.invites where token_hash = '$H3'")" "failed:create_user_failed"
check "a failed invite cannot be claimed" "$(as_service "select count(*) from public.kit_claim_invite('$H3', gen_random_uuid())")" 0

check "issue an invite to cancel" "$(as_service_commit "select role from public.kit_issue_invite('cancel@example.com', 'host', '$H4', '$ADMIN')")" host
check "cancel returns the email" "$(as_service_commit "select public.kit_cancel_invite((select id from public.invites where token_hash = '$H4'))")" "cancel@example.com"
check "cancel twice returns nothing" "$(as_service "select coalesce(public.kit_cancel_invite((select id from public.invites where token_hash = '$H4')), 'none')")" none

H5=$(printf 'e%.0s' {1..64})
q -c "insert into public.invites (email, role, token_hash, created_at, expires_at) values ('late@example.com', 'host', '$H5', now() - interval '8 days', now() - interval '1 day')" >/dev/null
check "an expired invite cannot be claimed" "$(as_service "select count(*) from public.kit_claim_invite('$H5', gen_random_uuid())")" 0
H6=$(printf 'f%.0s' {1..64})
q -c "insert into public.invites (email, role, token_hash, status, attempt_id, accepting_at, expires_at) values ('stuck@example.com', 'host', '$H6', 'accepting', gen_random_uuid(), now() - interval '20 minutes', now() + interval '1 day')" >/dev/null
check "a stuck acceptance is listed for reconciliation" "$(as_service "select email from public.kit_stale_invites(900)")" "stuck@example.com"
check "the hook refuses a stuck acceptance" \
  "$(as_hook "select public.kit_before_user_created('{\"user\":{\"email\":\"stuck@example.com\"}}'::jsonb) -> 'error' ->> 'http_code'")" 403

echo "-- staff lifecycle"
check "set a role returns the old one" "$(as_service_commit "select public.kit_set_staff_role('$HOST2', 'admin')")" host
check "the new role took" "$(q -c "select role from public.profiles where $PID = '$HOST2'")" admin
refused "set a role on a deactivated account" "$(as_service "select public.kit_set_staff_role('$GONE', 'host')")" "kit_profile_deactivated"
refused "set the pending role" "$(as_service "select public.kit_set_staff_role('$HOST2', 'pending')")" "kit_invalid_role"
refused "set a role with no profile" "$(as_service "select public.kit_set_staff_role('$NOPROFILE', 'host')")" "kit_profile_missing"
check "deactivate returns the old role" "$(as_service_commit "select public.kit_deactivate_staff('$HOST2')")" admin
check "deactivated is pending and stamped" "$(q -c "select role || ':' || (deactivated_at is not null) from public.profiles where $PID = '$HOST2'")" "pending:true"
check "deactivated is not active staff" "$(as_user "$HOST2" "select public.is_active_staff()")" f
as_service_commit "select public.kit_reactivate_staff('$HOST2', 'host')" >/dev/null
check "reactivated is active staff" "$(as_user "$HOST2" "select public.is_active_staff()")" t
refused "authenticated deactivates someone" "$(as_user "$ADMIN" "select public.kit_deactivate_staff('$HOST2')")" "permission denied"

echo "-- recovery grants"
R1=$(printf '1%.0s' {1..64}); R2=$(printf '2%.0s' {1..64}); R3=$(printf '3%.0s' {1..64})
positive "mint a grant (seconds left)" "$(as_service_commit "select extract(epoch from public.kit_mint_recovery_grant('$HOST', '$R1') - now())::int")"
as_service_commit "select public.kit_mint_recovery_grant('$HOST', '$R2')" >/dev/null
check "minting again invalidates the first" "$(as_service "select public.kit_claim_recovery_grant('$HOST', '$R1')")" f
check "another user cannot use the grant" "$(as_service "select public.kit_claim_recovery_grant('$ADMIN', '$R2')")" f
check "the live grant claims once" "$(as_service_commit "select public.kit_claim_recovery_grant('$HOST', '$R2')")" t
check "and never twice" "$(as_service "select public.kit_claim_recovery_grant('$HOST', '$R2')")" f
refused "a grant longer than 10 minutes" "$(as_service "select public.kit_mint_recovery_grant('$HOST', '$R3', 601)")" "kit_invalid_ttl"
refused "a grant for nobody" "$(as_service "select public.kit_mint_recovery_grant(gen_random_uuid(), '$R3')")" "kit_unknown_user"
q -c "insert into public.recovery_grants (user_id, token_hash, created_at, expires_at) values ('$HOST', '$R3', now() - interval '11 minutes', now() - interval '1 minute')" >/dev/null
check "an expired grant cannot be claimed" "$(as_service "select public.kit_claim_recovery_grant('$HOST', '$R3')")" f
R4=$(printf '4%.0s' {1..64})
as_service_commit "select public.kit_mint_recovery_grant('$ADMIN', '$R4')" >/dev/null
check "a new reset request invalidates the outstanding grant" "$(as_service_commit "select public.kit_invalidate_recovery_grants_for_email(' ADMIN@example.com ')")" 1
check "so it cannot be claimed" "$(as_service "select public.kit_claim_recovery_grant('$ADMIN', '$R4')")" f
refused "authenticated mints a grant" "$(as_user "$HOST" "select public.kit_mint_recovery_grant('$HOST', '$R4')")" "permission denied"

echo "-- throttle (counts failures in auth_audit)"
E1="v1:$(printf '9%.0s' {1..64})"; E2="v1:$(printf '8%.0s' {1..64})"
fail_rows() { q -c "insert into public.auth_audit (app, environment, event, outcome, email_hmac, ip) select 'kit', 'test', 'sign_in', 'failure', $1, '$2' from generate_series(1, $3) g" >/dev/null; }
fail_rows "'$E1'" 203.0.113.9 9
check "9 failures for the pair still allow" "$(as_service "select public.kit_auth_throttle('sign_in', '$E1', '203.0.113.9')")" 0
fail_rows "'$E1'" 203.0.113.9 1
positive "10 failures for the pair wait" "$(as_service "select public.kit_auth_throttle('sign_in', '$E1', '203.0.113.9')")"
check "the same email from another IP is allowed" "$(as_service "select public.kit_auth_throttle('sign_in', '$E1', '198.51.100.1')")" 0
q -c "insert into public.auth_audit (app, environment, event, outcome, email_hmac, ip) values ('kit', 'test', 'sign_in', 'success', '$E1', '203.0.113.9')" >/dev/null
check "a success clears the pair" "$(as_service "select public.kit_auth_throttle('sign_in', '$E1', '203.0.113.9')")" 0
fail_rows "'v1:' || lpad(to_hex(g), 64, '0')" 192.0.2.50 50
positive "50 failures from one IP across emails wait" "$(as_service "select public.kit_auth_throttle('sign_in', '$E2', '192.0.2.50')")"
q -c "insert into public.auth_audit (app, environment, event, outcome, email_hmac, ip) values ('kit', 'test', 'sign_in', 'success', '$E2', '192.0.2.50')" >/dev/null
positive "a success never clears the IP" "$(as_service "select public.kit_auth_throttle('sign_in', '$E2', '192.0.2.50')")"
fail_rows "'$E2'" 198.51.100.2 10
fail_rows "'$E2'" 198.51.100.3 10
positive "20 failures for an email across IPs wait" "$(as_service "select public.kit_auth_throttle('sign_in', '$E2', '198.51.100.4')")"
q -c "insert into public.auth_audit (app, environment, event, outcome, email_hmac, ip) values ('kit', 'test', 'password_reset_requested', 'success', '$E1', '203.0.113.20')" >/dev/null
positive "a second reset request within a minute waits" "$(as_service "select public.kit_auth_throttle('password_reset', '$E1', '203.0.113.21')")"
check "another address may ask" "$(as_service "select public.kit_auth_throttle('password_reset', '$E2', '203.0.113.21')")" 0
refused "an unknown scope" "$(as_service "select public.kit_auth_throttle('magic', null, null)")" "kit_unknown_throttle_scope"
refused "authenticated reads the throttle" "$(as_user "$ADMIN" "select public.kit_auth_throttle('sign_in', null, null)")" "permission denied"

echo "-- retention"
q -c "insert into public.auth_audit (app, environment, event, outcome, occurred_at) values
        ('kit', 'test', 'sign_in', 'success', now() - interval '13 months'),
        ('kit', 'test', 'role_changed', 'success', now() - interval '2 years'),
        ('kit', 'test', 'role_changed', 'success', now() - interval '7 years')" >/dev/null
check "prune deletes old telemetry and 6-year-old admin events" \
  "$(as_service_commit "select (r ->> 'audit_telemetry') || ':' || (r ->> 'audit_admin') from public.kit_prune_auth_data() r")" "1:1"
check "a 2-year-old admin event stays" "$(q -c "select count(*) from public.auth_audit where event = 'role_changed'")" 1
refused "authenticated prunes" "$(as_user "$ADMIN" "select public.kit_prune_auth_data()")" "permission denied"

echo "-- catalogue"
kit_fns="p.proname like 'kit\\_%' or p.proname in ('is_active_staff', 'is_active_admin', 'current_staff_role')"
check "kit functions anon may execute" \
  "$(q -c "select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and ($kit_fns) and has_function_privilege('anon', p.oid, 'execute')")" ""
check "kit functions authenticated may execute" \
  "$(q -c "select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and ($kit_fns) and has_function_privilege('authenticated', p.oid, 'execute')")" \
  "current_staff_role,is_active_admin,is_active_staff"
check "kit functions the Auth hook role may execute" \
  "$(q -c "select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and ($kit_fns) and has_function_privilege('supabase_auth_admin', p.oid, 'execute')")" \
  "kit_before_user_created"
check "kit definer functions without a fixed search_path" \
  "$(q -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and ($kit_fns) and (p.proconfig is null or not ('search_path=\"\"' = any(p.proconfig)))")" 0
check "kit tables with row level security off" \
  "$(q -c "select count(*) from pg_class where oid in ('public.profiles'::regclass, 'public.invites'::regclass, 'public.recovery_grants'::regclass, 'public.auth_audit'::regclass) and not relrowsecurity")" 0
gate_audit="$(node --input-type=module -e "import('$ROOT/src/auth/sql/index.js').then((m) => process.stdout.write(m.ACTIVE_STAFF_GATE_AUDIT_SQL))")"
check "tables authenticated can reach without the gate" "$(q -c "$gate_audit" | paste -sd, -)" ""

echo "failures: $fails"
[ "$fails" -eq 0 ]
