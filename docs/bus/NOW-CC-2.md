# NOW — CC-2 — ROUND 159 — 2026-09-28 (10:40Z)

Prior content archived byte-identical: `docs/bus/archive/NOW-CC-2-2026-09-28.md`.

ROUND 144's queue (check-number backfill, Write Check UI, 311 settlement lines, 31 deadhead
lines) is SUPERSEDED by everything below -- do not act on ROUND 144's text, it predates this
session's work and is now stale in multiple places (most importantly: it says 5817/5818 do not
exist and 5819 is held pending CC-1 -- that is no longer true, see below).

**DONE, merged, live this session:**
- Create Check (155.13 J1): ParityDrawer -> centered Modal, real vendor/customer/item pickers
  wired, shared close-safe dropdown. PR #22949 + #22951. Live-tested: real check posted,
  `accounting.expenses` id `f9c5b0e4-644c-4b03-b7c2-424d540ea65f`, balanced GL.
- AUTH-088/089 (155.7 retraction): bill-posting source-link backfill + settlement 5812 deduction
  fix. Merged, live-verified.
- Settlement Creator engine fix: `catalogs.accounts.is_active` didn't exist, engine was 100%
  non-functional for every settlement. PR #22953. Merged.
- **5817/5818/5819 are POSTED, real, exact to the signed PDFs to the cent** -- not blocked, not
  pending. `driver_finance.driver_settlements`: P-0015 (source_document_ref=5817, net $1,617.66),
  P-0016 (5818, net $1,015.43, includes a Reimbursed-Expenses line the feed JSON had missed
  entirely), P-0017 (5819, net $1,955.75, cancelled fake display_id `5819` left untouched per
  R-186.1). PRs #22958/#22959/#22963. Old empty shells P-0001/P-0002/P-0004 intentionally left
  alone -- that's 155.13 J5's cleanup, not this.
- ROUND 155.18 JOB 2 guards (fuel-card-rail, driver-2175 partial, one-feed-path,
  expense-entity-match) + an entity-scope fix in `expenses.routes.ts`. PR #22956. Merged.

**IN FLIGHT:** ROUND 155.18 JOB 1, owner-authorized directly (Jorge, in his own words) to purge
voided rows (25 tables, ~1,950 rows, USMCA) + two confirmed-100%-sample leaf tables
(`maintenance.pm_auto_wo_log`, `samsara.hos_snapshots` scoped to sample drivers) + close a real
WORM gap (current trigger exempts `neondb_owner`, unaudited -- demonstrated live, not just
inferred) + backfill 14 tables missing audit triggers + fix the two background jobs that were
writing against sample data (root-caused, one stopped by *coincidence* not by any fix -- see
AUTH ledger). The 58 sample MASTER rows and their full cascade (drivers fan out to 137
referencing tables, units to 90) are explicitly OUT of this round's scope -- deliberate, not an
oversight; that cascade needs its own pass. PRs landing under AUTH-091 (or its succeeding number
if renumbered on collision, per Rule 37/38 discipline this session followed all along).

**NOT YET STARTED (155.13 J3/J4/J5, still queued in order):**
3. Faro control totals: tie 2150 to the advances, report both numbers (2150 carries fee+reserve,
   is NOT the $311,587.00 invoice total). Day-range 09-22..09-25 handed to Cursor's lane (155.16).
4. 258-row void-header-vs-posting defect: header-only backfill to `posting_status='reversed'`,
   `scripts/verify-void-header-matches-postings.mjs`. GL already clean, POST NOTHING.
5. $3,549.13 of net pay on P-0001/P-0003/P-0005/P-0007 (zero lines each) -- read the AlwaysTrack
   export per driver before deciding which side is wrong. P-0001/0003/0005/0007 remain genuinely
   open/unbuilt (distinct from the now-superseded P-0002/0004 which were 5819/5818 candidates,
   now moot since those posted as fresh P-0015/0017/0016 instead).

If you're picking this seat up cold: read this file, not ROUND 144's text above the "DONE" line.
