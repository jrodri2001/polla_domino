-- Run this if your tables already exist but inserts are blocked by RLS.

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
