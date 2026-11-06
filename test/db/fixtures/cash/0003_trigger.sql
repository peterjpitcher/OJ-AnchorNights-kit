alter table public.profiles alter column role set default 'pending'::public.user_role;
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path to 'public', 'pg_catalog' as $$
begin
  insert into public.profiles (id, email, role) values (new.id, new.email, 'pending');
  return new;
end; $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
create policy "Users can insert their own profile." on public.profiles for insert to authenticated
  with check (auth.uid() = id and role = 'pending'::public.user_role);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
alter table public.sessions enable row level security;
create policy sessions_staff_read on public.sessions for select to authenticated using (true);
insert into public.sessions (name) values ('fixture session');
