-- ============================================
-- Polla Dominoes Tournament — Database Schema
-- ============================================

-- Players registered in the system
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  created_at timestamptz not null default now()
);

-- Tournaments
create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  table_count int not null default 1 check (table_count >= 1),
  status text not null default 'setup' check (status in ('setup', 'active', 'completed')),
  created_at timestamptz not null default now()
);

-- Junction: which players are in which tournament
create table tournament_players (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  primary key (tournament_id, player_id)
);

-- Rounds within a tournament
create table rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round_number int not null,
  unique (tournament_id, round_number)
);

-- Individual games (1 per table per round)
create table games (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  table_number int not null default 1,
  team1_player1 uuid not null references players(id),
  team1_player2 uuid not null references players(id),
  team2_player1 uuid not null references players(id),
  team2_player2 uuid not null references players(id),
  team1_score int,
  team2_score int,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed'))
);

-- Players resting during a round
create table byes (
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id),
  primary key (round_id, player_id)
);

-- Index for fast tournament lookups
create index idx_rounds_tournament on rounds(tournament_id);
create index idx_games_round on games(round_id);
create index idx_byes_round on byes(round_id);

-- ── Row Level Security ──────────────────────────────────────────────────
-- This is a trusted, friends-only app (no user auth) so we allow full
-- access through the anon key.  If you add Supabase Auth later, tighten
-- these policies to check auth.uid().

alter table players            enable row level security;
alter table tournaments        enable row level security;
alter table tournament_players enable row level security;
alter table rounds             enable row level security;
alter table games              enable row level security;
alter table byes               enable row level security;

create policy "allow all on players"            on players            for all using (true) with check (true);
create policy "allow all on tournaments"        on tournaments        for all using (true) with check (true);
create policy "allow all on tournament_players" on tournament_players for all using (true) with check (true);
create policy "allow all on rounds"             on rounds             for all using (true) with check (true);
create policy "allow all on games"              on games              for all using (true) with check (true);
create policy "allow all on byes"               on byes               for all using (true) with check (true);

-- Enable Supabase Realtime on games table for live leaderboard
alter publication supabase_realtime add table games;
