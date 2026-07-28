PRAGMA foreign_keys = ON;

INSERT INTO role_verifications
  (user_id, role, status, reviewed_by, reviewed_at, decision_note, updated_at)
SELECT ur.user_id, ur.role, 'pending', NULL, NULL, '', datetime('now')
FROM user_roles ur
JOIN users u ON u.id = ur.user_id AND u.status = 'active'
JOIN membership_applications ma
  ON ma.user_id = ur.user_id AND ma.status = 'approved'
LEFT JOIN role_verifications rv
  ON rv.user_id = ur.user_id AND rv.role = ur.role
WHERE rv.user_id IS NULL;
