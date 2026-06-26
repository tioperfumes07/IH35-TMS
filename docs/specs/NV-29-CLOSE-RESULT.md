# NV-29-CLOSE — non-financial board closed (verify-first)

Final pass of the session-long verify-first reconciliation: closed the remaining NON-FINANCIAL NEEDS-VERIFY /
PENDING blocks. Same method — grep real artifacts on main, classify, backfill verified paths (no fake paths,
no financial touch). The `.block-ready` blocks had **blank `allowed_files`** (registry never populated) so the
classifier couldn't see their built features; populated `allowed_files` with verified-present artifacts.

## Promoted (7) — all already-built false-negatives
| block | source | real artifact on main |
|---|---|---|
| BK7-INLINE-CREATE-DRAWERS | .block-ready | `components/parity/InlineCreateDrawer.tsx` + drawer forms |
| BLOCK-I-CI-DIST-FIX | .block-ready | `scripts/verify-no-duplicate-routes.mjs` |
| BLOCK-J-MASTER-DATA-GRANT | .block-ready | `db/migrations/202606072230_grant_master_data_schema_to_app.sql` + `verify-migration-filenames.mjs` |
| PREREQ-A-SCHEMA-GRANT-GATE | .block-ready | `scripts/verify-migration-schema-grants.mjs` |
| FIX-REQUIRED-CHECKS-GATE | .block-ready | `scripts/verify-ci-policy-applied.mjs` |
| FIX-AUDIT-TRIGGER-DRIFT | .block-ready | `db/migrations/202606080030_audit_trigger_drift_remediation.sql` |
| HOS-BUG-DRIVERASSIGN | program | **bug already FIXED** — `samsara-client.ts` uses valid `types=gps,engineStates`; `verify-samsara-stats-types.mjs` guards it |

## Honest counts
| | before | after |
|---|---|---|
| DONE | 404 | **411** |
| NEEDS-VERIFY | 23 | **19** (all financial) |
| PENDING | 5 | **2** |
| PENDING (GATED) | 24 | 24 |
| **TOTAL PENDING** | **29** | **26** |

## RESIDUAL (non-financial, not-gated) — for GUARD/Jorge confirm-before-build
- **TBL-STANDARD-universal-table-sweep** — genuinely **PARTIAL**. The shared `DataTable`/`ParityTable` is done
  (per UX-A), but the *universal* sweep applying the table standard across every list page is incomplete.
  Exact gap: audit each list page → confirm it uses the standard table contract (sort/resize/sticky/export/
  density). This is the ONLY non-financial feature with real remaining work.

CASH-FLOW-MODULE (.block-ready, empty registry) is financial-adjacent → left for the financial gate, not promoted.

## NON-FINANCIAL NEEDS-VERIFY BOARD: **CLOSED.** Zero non-financial NV remain.

## FINANCIAL — left for Jorge+GUARD Tier-1 gate (untouched)
28 financial non-DONE: 19 NEEDS-VERIFY (AF-*, CHAIN-*, STMT-1, block-37/40 — code mostly on main but Tier-1
gated; AF-1 entity-COA = design-only) + 9 PENDING (GATED) (CONN-*, STMT-2/3, VOID, CHAIN-08, FH-VERIFY).
No classification change, no promotion, no build, no flag-flip.

GATED non-financial (excluded per scope, HELD): BLOCK-01/02/03 (deprec/escrow/IFTA), 17/19/24/25, DISP-WIZARD,
DISP-WO, ENT-AUDIT, HOS-FANOUT/MAP/PRC/PRC2, USMCA-LAUNCH — Jorge/GUARD gate.
