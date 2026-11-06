-- The parts of a Supabase database the auth templates lean on, and nothing
-- more. Copied from Quiz Night's supabase/tests/supabase-stubs.sql, plus the
-- auth.users columns the active-identity gate reads (banned_until,
-- deleted_at). auth.uid() reads the same setting PostgREST sets from the JWT,
-- so a check acts as a user with `set local request.jwt.claim.sub = '<uuid>'`.
-- The roles are made by run.sh because roles belong to the cluster.

create schema if not exists auth;
create schema if not exists extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Supabase grants the API roles everything in public by default and relies on
-- RLS. The templates must hold from that starting point.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
