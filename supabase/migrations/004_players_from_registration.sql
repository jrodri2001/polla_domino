-- ============================================
-- Players now come from user registration
-- ============================================

-- Update trigger: auto-create a player record on signup if one doesn't exist
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

  -- If no player matched, create one from signup data
  if matched_player_id is null then
    insert into public.players (name, email)
    values (
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email
    )
    returning id into matched_player_id;
  end if;

  insert into public.profiles (id, role, player_id)
  values (new.id, 'player', matched_player_id);

  return new;
end;
$$;

-- Backfill: create player records for existing auth users who don't have one
insert into players (name, email)
select
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  u.email
from auth.users u
left join players p on p.email = u.email
where p.id is null;

-- Backfill: link profiles to player records where player_id is still null
update profiles
set player_id = p.id
from players p
join auth.users u on u.email = p.email
where profiles.id = u.id
  and profiles.player_id is null;