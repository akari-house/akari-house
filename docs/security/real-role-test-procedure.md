# Real-role launch test procedure

For every launch-gate check, use a dedicated production-style account and record the expected and observed result in `/admin/launch-gate`.

1. Exercise the permitted route or action.
2. Attempt the equivalent action against another user's record.
3. Repeat after role removal, suspension or session invalidation where applicable.
4. Record evidence without storing passwords, session cookies or private document contents.
5. Mark the check passed only when the permitted path succeeds and every forbidden path is denied.

Accessibility evidence must cover keyboard-only navigation, visible focus, form labels, error announcements and representative mobile viewports. Upload evidence must cover invalid MIME types, renamed executable content, oversized files and unsafe filenames. Rate-limit evidence must show normal use succeeds while repeated abusive requests are blocked.
