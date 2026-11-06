-- Cash Bingo's shape: profiles keyed by id, an enum role, an email column, a
-- sign-up trigger, a self-insert policy pinned to pending, and staff tables
-- the authenticated role reads.
create type public.user_role as enum ('admin', 'host');
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role public.user_role default 'host'::public.user_role,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
