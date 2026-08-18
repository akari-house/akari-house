-- R84 read-only AKARI House legacy CRM inventory.
-- Run manually against a backed-up House D1 database.
-- Do not commit production query output or exports to GitHub.
-- These queries intentionally return counts only.

SELECT 'legacy_agreement_records' AS metric, COUNT(*) AS value
FROM agreement_records;

SELECT 'legacy_nda_records' AS metric, COUNT(*) AS value
FROM agreement_records
WHERE agreement_type = 'nda';

SELECT 'legacy_current_signed_ndas' AS metric, COUNT(*) AS value
FROM agreement_records
WHERE agreement_type = 'nda'
  AND status = 'signed'
  AND (expires_at IS NULL OR expires_at > datetime('now'));

SELECT 'legacy_agreements_with_project' AS metric, COUNT(*) AS value
FROM agreement_records
WHERE project_id IS NOT NULL;

SELECT 'legacy_ndas_with_counterparty_email' AS metric, COUNT(*) AS value
FROM agreement_records
WHERE agreement_type = 'nda'
  AND length(trim(COALESCE(counterparty_email,''))) > 0;

SELECT 'legacy_relationship_records' AS metric, COUNT(*) AS value
FROM relationship_records;

SELECT 'legacy_saas_workspaces' AS metric, COUNT(*) AS value
FROM saas_workspaces;

-- Coverage indicator for the exact compatibility path R84 is replacing.
SELECT 'legacy_current_ndas_resolvable_to_house_user' AS metric, COUNT(*) AS value
FROM agreement_records ar
WHERE ar.agreement_type = 'nda'
  AND ar.status = 'signed'
  AND (ar.expires_at IS NULL OR ar.expires_at > datetime('now'))
  AND EXISTS (
    SELECT 1
    FROM users u
    WHERE lower(trim(u.email)) = lower(trim(ar.counterparty_email))
  );
