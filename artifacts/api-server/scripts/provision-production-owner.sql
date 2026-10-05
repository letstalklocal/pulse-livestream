WITH added AS (
  INSERT INTO admin_staff (clerk_user_id, role, enabled)
  SELECT 'user_3JJ7roIjFeLukMbmmU9YWqKRvoZ', 'owner', true
  WHERE NOT EXISTS (SELECT 1 FROM admin_staff)
  ON CONFLICT (clerk_user_id) DO NOTHING
  RETURNING clerk_user_id, role, enabled
), audited AS (
  INSERT INTO admin_audit_events
    (actor_clerk_id, action, target, outcome)
  SELECT 'bootstrap', 'owner.provision', clerk_user_id, 'allowed'
  FROM added
  RETURNING target
)
SELECT added.clerk_user_id, added.role, added.enabled
FROM added JOIN audited ON audited.target = added.clerk_user_id
UNION ALL
SELECT clerk_user_id, role, enabled
FROM admin_staff
WHERE clerk_user_id = 'user_3JJ7roIjFeLukMbmmU9YWqKRvoZ'
  AND NOT EXISTS (SELECT 1 FROM added);
