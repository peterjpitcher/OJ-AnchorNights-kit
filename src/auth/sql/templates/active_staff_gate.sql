-- @anchor-nights/kit auth: the active-identity gate on public.{{table}}.
-- Restrictive, so it narrows every other policy on the table: an account that
-- is not active staff (pending, deactivated, banned or deleted) reaches no row
-- here through the Data API, RPC or Realtime, even with a still-valid JWT.
alter table public.{{table}} enable row level security;
drop policy if exists active_staff_gate on public.{{table}};
create policy active_staff_gate on public.{{table}}
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));
