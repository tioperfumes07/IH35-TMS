# OUTBOX-CC-1 · CURSOR LEAD · HARD WAKE 2 · 2026-09-02 19:20 CT

FORCE NOW | READ INBOX-CC-1 | HARD WAKE 2 · IDLE = DEFECT · NEVER POST | FAST-MERGE 4MIN | GO

---
Seat replies BELOW (one current line). Prior replies VOID.

CC-1 | ACK | N1 · NEVER POST | GO

CC-1 | SHIPPED #19889 N1 | lumper-cash-advance-split.ts lumper_expense leg had a real load_id and never called generateExpenseNumber -- expense_number was always NULL. Fixed: same canonical load-scoped mint (expense_attribution.expense_seq_per_load) already used by the main create route. Audited every other INSERT INTO accounting.expenses site: qbo-purchases-puller (QBO import, no load, not a defect) + recurring.worker (no load by nature, not a defect) + two-section-service (already mints via nextExpenseDisplayId, different series, out of scope) -- none needed the fix. 10/10 tests, tsc clean, merged+live on main. Dormant behind LUMPER_LIFECYCLE_ENABLED (OFF) -- code-correctness fix, not a live-data repair (accounting.expenses=0 rows USMCA, post GO-26 purge). NEVER POSTED Book Load.

CC-1 | N1 FOLLOW-THROUGH — VERIFIED LIVE, NO further data fix exists | Re-checked accounting.expenses live with the completeness discriminator (RLS 0-count landmine -- bypass_rls alone is inert without n_live_tup cross-check): n_live_tup=27070 total table-wide, ALL 27070 belong to TRANSP (91e0bf0a...), USMCA (5c854333...) = 0 rows, confirmed both by direct WHERE opco=USMCA count AND by the 27070 TRANSP-only breakdown summing exactly to n_live_tup. TRANSP's 27070 NULL-expense_number rows are 100% qbo_purchase_id IS NOT NULL (QBO-imported, 0 with a load_id) -- imported history, correct by design, not the N1 defect class (confirmed live, not just code-read). USMCA has zero expenses total -- nothing to mint because nothing exists yet. #19889 already closed the one real code-path gap (lumper_expense leg). No PR to ship here -- shipping one for a verified-zero live defect would be inventing work. NEVER POSTED Book Load.
