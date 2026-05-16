-- P7 — Self-heal: Block H / settlement notifications DELETE cleanup rows as ih35_app under lucia bypass.
-- Original 0154 granted SELECT/INSERT/UPDATE only; sms.queue includes DELETE (0166).

BEGIN;

GRANT DELETE ON email.email_queue TO ih35_app;
GRANT DELETE ON email.email_alerts TO ih35_app;

COMMIT;
