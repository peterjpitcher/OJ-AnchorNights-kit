-- A project with no profiles table yet (Music Bingo, Tasting Night) and one
-- staff table the authenticated role can reach.
create table public.app_notes (
  id uuid primary key default gen_random_uuid(),
  body text not null
);
alter table public.app_notes enable row level security;
create policy app_notes_read on public.app_notes for select to authenticated using (true);
create policy app_notes_write on public.app_notes for insert to authenticated with check (true);
insert into public.app_notes (body) values ('fixture note');
