PRAGMA foreign_keys = ON;

-- Applicant profiles are intentionally private. Once an application is approved,
-- an untouched default should become connection-gated so the member can be found
-- without exposing the full profile before a mutual connection exists.
UPDATE profiles
SET visibility = 'connections',
    updated_at = datetime('now')
WHERE visibility = 'private'
  AND EXISTS (
    SELECT 1
    FROM membership_applications ma
    JOIN users u ON u.id = ma.user_id
    WHERE ma.user_id = profiles.user_id
      AND ma.status = 'approved'
      AND u.status = 'active'
      AND profiles.updated_at <= COALESCE(ma.reviewed_at, ma.updated_at)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM account_closure_requests closure
    WHERE closure.user_id = profiles.user_id
      AND closure.status = 'cooling_off'
  );

UPDATE profile_visibility
SET visibility = 'connections',
    updated_at = datetime('now')
WHERE visibility = 'private'
  AND EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = profile_visibility.user_id
      AND p.visibility = 'connections'
  );
