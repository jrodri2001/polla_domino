-- ============================================
-- Auth: profiles, trigger, and RLS policies
-- ============================================

-- Profiles linked to Supabase Auth users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('admin', 'player')),
  player_id uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_profiles_player on profiles(player_id);

alter table profiles enable row level security;

-- ── Helper functions (SECURITY DEFINER to bypass RLS) ───────────────────

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.my_player_id()
returns uuid
language sql
stable
security definer set search_path = ''
as $$
  select player_id from public.profiles where id = auth.uid();
$$;

-- ── Profiles RLS policies ───────────────────────────────────────────────

-- Users can read their own profile
create policy "users read own profile"
  on profiles for select
  using (auth.uid() = id);

-- Admins can read all profiles (uses SECURITY DEFINER function to avoid recursion)
create policy "admins read all profiles"
  on profiles for select
  using (public.is_admin());

-- Only admins can update profiles (e.g. promote to admin, link player_id)
create policy "admins update profiles"
  on profiles for update
  using (public.is_admin());

-- ── Trigger: auto-create profile on signup ──────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  matched_player_id uuid;
begin
  -- Try to match by email to an existing player
  select id into matched_player_id
    from public.players
    where email = new.email
    limit 1;

  insert into public.profiles (id, role, player_id)
  values (new.id, 'player', matched_player_id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Drop old "allow all" policies ───────────────────────────────────────

drop policy if exists "allow all on players"            on players;
drop policy if exists "allow all on tournaments"        on tournaments;
drop policy if exists "allow all on tournament_players" on tournament_players;
drop policy if exists "allow all on rounds"             on rounds;
drop policy if exists "allow all on games"              on games;
drop policy if exists "allow all on byes"               on byes;

-- ── Players table ───────────────────────────────────────────────────────

-- All authenticated users can read players (needed for standings/leaderboard)
create policy "authenticated read players"
  on players for select
  using (auth.uid() is not null);

-- Only admins can insert/update/delete players
create policy "admins manage players"
  on players for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── Tournaments table ───────────────────────────────────────────────────

-- Admins see all tournaments
create policy "admins read all tournaments"
  on tournaments for select
  using (public.is_admin());

-- Players see tournaments they participate in
create policy "players read own tournaments"
  on tournaments for select
  using (
    exists (
      select 1 from tournament_players tp
      where tp.tournament_id = tournaments.id
        and tp.player_id = public.my_player_id()
    )
  );

-- Only admins can insert/update/delete tournaments
create policy "admins manage tournaments"
  on tournaments for insert with check (public.is_admin());

create policy "admins update tournaments"
  on tournaments for update using (public.is_admin());

create policy "admins delete tournaments"
  on tournaments for delete using (public.is_admin());

-- ── Tournament players table ────────────────────────────────────────────

-- Admins see all
create policy "admins read all tournament_players"
  on tournament_players for select
  using (public.is_admin());

-- Players see their own entries
create policy "players read own tournament_players"
  on tournament_players for select
  using (player_id = public.my_player_id());

-- Only admins manage
create policy "admins manage tournament_players"
  on tournament_players for insert with check (public.is_admin());

create policy "admins delete tournament_players"
  on tournament_players for delete using (public.is_admin());

-- ── Rounds table ────────────────────────────────────────────────────────

-- Admins see all rounds
create policy "admins read all rounds"
  on rounds for select
  using (public.is_admin());

-- Players see rounds for their tournaments
create policy "players read own rounds"
  on rounds for select
  using (
    exists (
      select 1 from tournament_players tp
      where tp.tournament_id = rounds.tournament_id
        and tp.player_id = public.my_player_id()
    )
  );

-- Only admins manage rounds
create policy "admins manage rounds"
  on rounds for insert with check (public.is_admin());

create policy "admins delete rounds"
  on rounds for delete using (public.is_admin());

-- ── Games table ─────────────────────────────────────────────────────────

-- All authenticated users can read games (needed for standings)
create policy "authenticated read games"
  on games for select
  using (auth.uid() is not null);

-- Only admins can insert/update/delete games
create policy "admins manage games"
  on games for insert with check (public.is_admin());

create policy "admins update games"
  on games for update using (public.is_admin());

create policy "admins delete games"
  on games for delete using (public.is_admin());

-- ── Byes table ──────────────────────────────────────────────────────────

-- Admins see all byes
create policy "admins read all byes"
  on byes for select
  using (public.is_admin());

-- Players see byes for their tournaments
create policy "players read own byes"
  on byes for select
  using (
    exists (
      select 1 from rounds r
      join tournament_players tp on tp.tournament_id = r.tournament_id
      where r.id = byes.round_id
        and tp.player_id = public.my_player_id()
    )
  );

-- Only admins manage byes
create policy "admins manage byes"
  on byes for insert with check (public.is_admin());

create policy "admins delete byes"
  on byes for delete using (public.is_admin());