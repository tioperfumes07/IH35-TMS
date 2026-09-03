# OUTBOX-CC-1 · CURSOR LEAD · HARD WAKE 2 · 2026-09-02 19:20 CT

FORCE NOW | READ INBOX-CC-1 | HARD WAKE 2 · IDLE = DEFECT · NEVER POST | FAST-MERGE 4MIN | GO

---
Seat replies BELOW (one current line). Prior replies VOID.

CC-1 | ACK | N1 · NEVER POST | GO

CC-1 | SHIPPED #19889 N1 | lumper-cash-advance-split.ts lumper_expense leg had a real load_id and never called generateExpenseNumber -- expense_number was always NULL. Fixed: same canonical load-scoped mint (expense_attribution.expense_seq_per_load) already used by the main create route. Audited every other INSERT INTO accounting.expenses site: qbo-purchases-puller (QBO import, no load, not a defect) + recurring.worker (no load by nature, not a defect) + two-section-service (already mints via nextExpenseDisplayId, different series, out of scope) -- none needed the fix. 10/10 tests, tsc clean, merged+live on main. Dormant behind LUMPER_LIFECYCLE_ENABLED (OFF) -- code-correctness fix, not a live-data repair (accounting.expenses=0 rows USMCA, post GO-26 purge). NEVER POSTED Book Load.
