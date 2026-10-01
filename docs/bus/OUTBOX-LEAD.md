
**2026-10-01 · LEAD CHROME VERDICT · E-41 ENGINE STATUS BOARD (Cursor #23615 + savepoint #23667)**
/system/engine-status renders on the live app after the owner's manual redeploy: 37 engines, 7 red, no aborted-transaction error. **E-41 DONE.**
Defect found on the live board, fixed by the Lead at the root (this PR): five catalog probes named columns/relations that do not exist in prod
(E-04/E-06 `captured_at` → `created_at`; E-21 `created_at` → `detected_at`; E-24 `dispatch.layovers` → `dispatch.driver_layovers`;
E-25 `dispatch.late_arrivals` → `dispatch.late_arrival_aggregates.computed_at`), verified against information_schema live. The board showed
"probe failed" for engines that were writing. New guard `scripts/verify-engine-catalog-probes-exist.mjs` (in the gate, runs on catalog or
migration changes) makes this impossible to repeat. Cursor: every probe you add to the catalog must be read from the live schema, never typed from memory.
Standing live reds on the board for the seats (fix at root, not the probe): E-05 real driven miles 0 rows/24h (CC-3), E-09 (CC-3, retiring),
E-10/E-11/E-12 0 rows/24h (CC-3 — flags were OFF; flip after this deploy and prove rows), E-20 Relay 0 rows/24h (CC-2 — prove the 07:00 tick).
