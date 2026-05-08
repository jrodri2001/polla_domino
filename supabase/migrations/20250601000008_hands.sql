-- ============================================
-- Hand-by-hand scoring for domino games
-- ============================================
-- Venezuelan domino is played to 100 points.
-- Each hand's points are recorded individually
-- and accumulated on the parent games row.

create table hands (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  hand_number int not null,
  team1_points int not null default 0,
  team2_points int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, hand_number)
);

create index idx_hands_game on hands(game_id);

alter table hands enable row level security;
create policy "allow all on hands" on hands for all using (true) with check (true);

alter publication supabase_realtime add table hands;