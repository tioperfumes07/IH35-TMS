-- 443.91 #4 (CC-3, batch 1): 202614670900_live_loads_factor_but_not_delivered re-created views.live_loads with a bare
-- CREATE OR REPLACE VIEW (no WITH clause), which RESETS the view's reloptions — security_invoker was dropped, so the view
-- ran with its owner's rights and bypassed mdata.loads' FORCED row-level security (prod: reloptions NULL, 2026-10-12).
-- Guard: apps/backend/src/audit/__tests__/live-defects-f1-f3.db.test.ts F3 ("no user-schema view lacks security_invoker").
-- Restores the option without touching the view's definition.
SET LOCAL lock_timeout = '60s';
ALTER VIEW views.live_loads SET (security_invoker = true);
