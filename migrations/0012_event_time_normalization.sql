-- Existing event forms stored UTC wall-clock values with a `T` separator.
-- Normalize those rows to SQLite's canonical UTC datetime representation so
-- ordering and comparisons against datetime('now') remain correct.
UPDATE events
SET starts_at = replace(substr(starts_at, 1, 19), 'T', ' '),
    ends_at = replace(substr(ends_at, 1, 19), 'T', ' ')
WHERE timezone = 'UTC'
  AND (instr(starts_at, 'T') > 0 OR instr(ends_at, 'T') > 0);
