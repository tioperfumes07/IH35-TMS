# Block-count truth-up — 2026-06-27 (DISPATCH-D)

**Why:** Jorge asked whether today's ~30 blocks are in the "26 of 456" count. They were **not** — that
count was the pre-today board. Today's bug-fix / build / dispatch work shipped as PRs but most had no
`.block-ready/*.json`, so no reconcile run could count it. This truth-up registers today's blocks and makes
the reconciler emit a per-block PR list, an "added since" delta, and the source-universe breakdown.

## The 456-vs-294 gap, explained
The reconciler universe is the **union of 5 sources**, de-duped by id — it is **not** the `.block-ready`
file count:

| Source | Blocks (after de-dup) |
|--------|----------------------|
| `.block-ready/*.json` | 294 |
| `docs/blocks/**` (program) | 61 |
| `docs/dispatch` (enterprise-29) | 29 |
| `docs/accounting` (posting engine) | 26 |
| `docs/specs/gap-*` | 57 |
| **TOTAL** | **467** |

`.block-ready/` now has **305** files on disk; 294 survive as `.block-ready`-sourced after some ids de-dup
under higher-rank program/accounting entries. (Earlier GUARD note said the JSON had "only four totals" —
that was a stale read; the committed JSON already carried a `blocks[]` array. It now also carries
`universe` + `delta`.)

## Count movement (this truth-up)
| | Before (pre-today) | After (today's blocks registered) |
|--|--|--|
| TOTAL | 456 | **467** |
| DONE | 411 | **420** |
| NEEDS-VERIFY | 19 | **19** (all financial) |
| PENDING | 2 | **4** |
| PENDING (GATED) | 24 | **24** |
| **TOTAL PENDING** (PENDING + GATED) | 26 | **28** |

The +9 DONE and +2 PENDING are exactly today's registered blocks (see delta). Numbers moved because the
work is real.

## Delta — blocks added since 2026-06-16 (today's work, now counted)
Auto-emitted into `block-reconciliation-data.json` (`delta`) and `BLOCK-RECONCILIATION-2026-06-27.md`:

| Block | Status | PR | Notes |
|-------|--------|----|-------|
| FIX-PER-TRUCK-CPM-PERMITS-CTE | DONE | #1517 | permits CTE 500 fix |
| DOC-CATALOGS-ACCOUNTS-FK-INVENTORY | DONE | #1518 | AF-1 input |
| DOC-CATALOGS-CLASSES-FK-INVENTORY | DONE | #1519 | AF-1 companion |
| FIX-LEGAL-FLEET-VEHICLE-TYPE-PHANTOM | DONE | #1520 | /fleet 500 fix |
| FIX-DISPATCH-DRIVER-PICKER-50-CAP | DONE | #1530 | Book Load picker (also #1529) |
| TBL-STANDARD-INSURANCE-POLICIES | DONE | #1531 | TBL-STANDARD surface 1 |
| FIX-MAINTENANCE-SERVICES-ETA-PHANTOM | DONE | #1532 | services/eta 500 fix |
| FIX-PICKERS-50-CAP-UNITS-VENDORS-CUSTOMERS | DONE | #1533 | picker 50-cap class |
| FIX-DRIVERS-FULL-NAME-PHANTOM | DONE | #1534 | drivers.full_name phantom |
| QBO-SYNC-DRIFT-401-FIX | PENDING | #1535 | DISPATCH-C — in flight (CI green, unmerged) |
| UNIFIED-TXN-REGISTER | PENDING | #1536 | DISPATCH-B — in flight (unmerged) |

In-flight blocks (#1535, #1536) read **PENDING** until their branch merges, then auto-promote to **DONE**
(the reconciler classifies `.block-ready` by branch→merged-PR / signature-files-on-main, not by self-report).

## Not registered as `.block-ready` (and why)
- **Tracker chores #1521–#1527** (NEEDS-VERIFY sweep, full-tracker reconciliation, NV-29-CLOSE, TBL inventory):
  these are reconciliation *work products*, not buildable feature blocks — they have no app artifact, so they
  are not blocks. Listed here for the record.
- **AF-program (AF-0..AF-8) incl. AF-1 #1528 (HOLD):** already present in the universe as 9 `AF-*` gap-spec
  blocks (NEEDS-VERIFY/GATED, all financial). Not duplicated. AF-1 stays Tier-1 HOLD — untouched here.

## What changed in this PR
- `.block-ready/`: **11 new files** (additive — none of the existing 294 edited/removed), each with a real
  `branch`, `allowed_files`, and an `"added": "2026-06-27"` field for the delta.
- `scripts/reconcile-block-status.mjs`: now emits per-block `pr`, a `universe` breakdown, and a `delta`
  (blocks added since 2026-06-16) into both the JSON and the MD. No status-logic change — same evidence rules.
- Regenerated `docs/trackers/block-reconciliation-data.json` + `BLOCK-RECONCILIATION-2026-06-27.md` + xlsx.

**No app code, no migration, no posting, no `catalogs.accounts`, no AF-1 branch touched.**
