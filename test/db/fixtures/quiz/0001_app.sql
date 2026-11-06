-- Quiz Night's shape: profiles keyed by user_id, a text role with a check,
-- display_name, a sign-up trigger that starts accounts as pending, and the
-- grants of 20261007170346 (select, update of display_name only).
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'pending' check (role in ('admin', 'host', 'pending')),
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (user_id = auth.uid());
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, role, display_name)
  values (new.id, 'pending', split_part(new.email, '@', 1))
  on conflict (user_id) do nothing;
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  status text not null default 'draft'
);
alter table public.sessions enable row level security;
create policy sessions_owner on public.sessions for all to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());
