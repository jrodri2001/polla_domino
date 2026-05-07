-- ============================================
-- Merge profiles into players
-- ============================================
-- The profiles table was an auth bridge. This migration folds its columns
-- (auth_id, role) directly into players and drops profiles entirely.

-- 1. Add auth + role columns to players
ALTER TABLE players ADD COLUMN auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE players ADD COLUMN role text NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player'));

-- 2. Safety check: abort if any profile has a NULL player_id.
--    Migration 004 backfilled these, but catch edge-case data before we lose it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE player_id IS NULL) THEN
    RAISE EXCEPTION 'Found profiles with NULL player_id — fix these before migrating';
  END IF;
END $$;

-- 3. Backfill from profiles
UPDATE players
SET auth_id = p.id,
    role    = p.role
FROM profiles p
WHERE p.player_id = players.id;

-- 4. Rewrite helper functions BEFORE dropping profiles, so RLS policies
--    that depend on is_admin()/my_player_id() never reference a missing table.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players WHERE auth_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_player_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT id FROM public.players WHERE auth_id = auth.uid();
$$;

-- 5. Drop ALL RLS policies on profiles
DROP POLICY IF EXISTS "users read own profile"          ON profiles;
DROP POLICY IF EXISTS "admins read all profiles"        ON profiles;
DROP POLICY IF EXISTS "admins update profiles"          ON profiles;
DROP POLICY IF EXISTS "all authenticated read profiles" ON profiles;

-- 6. Drop profiles table (cascades index)
DROP TABLE profiles CASCADE;

-- 7. Rewrite handle_new_user() — no more profiles insert.
--    SECURITY DEFINER is required because this trigger fires from an
--    auth.users INSERT by the Supabase auth service. Without it the
--    "admins manage players" RLS policy (which calls is_admin()) would
--    block the INSERT/UPDATE on the players table.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  matched_player_id uuid;
  existing_auth_id  uuid;
BEGIN
  -- Try to match by email to an existing player
  SELECT id, auth_id INTO matched_player_id, existing_auth_id
    FROM public.players
    WHERE email = NEW.email
    LIMIT 1;

  IF matched_player_id IS NOT NULL THEN
    -- Guard: don't overwrite a player already linked to a different auth user
    IF existing_auth_id IS NOT NULL AND existing_auth_id <> NEW.id THEN
      RAISE EXCEPTION 'Player % already linked to auth user %', matched_player_id, existing_auth_id;
    END IF;
    -- Link existing player to auth user
    UPDATE public.players SET auth_id = NEW.id WHERE id = matched_player_id;
  ELSE
    -- Create a new player
    INSERT INTO public.players (name, email, auth_id)
    VALUES (
      coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      NEW.email,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 8. Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
