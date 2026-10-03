# Financial blocks — buildable-vs-design split (2026-10-01)

Classifies every FINANCIAL, NOT-done block (status PENDING / PENDING (GATED)) from its .block-ready source spec.

## Counts
- **BUILDABLE-NOW-AND-HOLD**: 6
- **NEEDS-JORGE-DECISION**: 16
- **TOTAL**: 22

## BUILDABLE-NOW-AND-HOLD (coder can build now → [HOLD-FOR-JORGE] PR; label needed only to merge)
| id | lane | acceptance | summary |
|----|------|-----------|---------|
| CHAIN-06-invoice-ar-chain-proof | tier1 | functional | Accounting Core Block 25/67 — CHAIN-06 invoice→A/R→Faro fail-closed static chain proof + mocked serv |
| CONN-3-relay-internal-bank | program | functional | Relay internal-bank (pre-funded bank; withdrawals = same-day debit) + diesel-code -> approve -> post |
| FIX-05-BANKING-SPLIT-ENABLE-AND-WIRE | banking | functional |  |
| ITEM-02-EXCEL-UPLOAD-RLS-REASSERT | catalogs-rls | functional |  |
| P2-BANK-AUTOMATCH-observable | PHASE-2-CORE-ACCOUNTING-WIRING | functional | P2-BANK-AUTOMATCH (observability half): the nightly bank-recon auto-match tick discarded its metric  |
| STMT-2-opening-balances | program | functional | Owner-entered opening balances per entity -> balanced opening JE. Registered so its criteria become  |

## NEEDS-JORGE-DECISION (not buildable until the owner decides)
| id | lane | why | decision needed |
|----|------|-----|-----------------|
| accounting-2-ap-aging-qbo-mirror-population | tier2 | functional/no-files | goal defined but no named target files — owner/design names allowed_files, then buildable: {"check":"table/column/fk/rls/route/mounted proven; effective(flag via |
| AF-1-entity-coa-fix | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| AF-2-qbo-drift | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| AF-4-ap-bills-migration | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| AF-7-money-controls | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| AF-8-payroll-bridge | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| CHAIN-07-settlements-500-fix | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| chain-08-demo-data-purge | tier1 | functional/no-files | goal defined but no named target files — owner/design names allowed_files, then buildable: {"check":"table/column/fk/rls/route/mounted proven; effective(flag via |
| CHAIN-08-transp-demo-data-purge | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| CONN-4-edi-foundation | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| driverprofile-1-companion-tier1-rls-hardening | tier1 | functional/no-files | goal defined but no named target files — owner/design names allowed_files, then buildable: {"check":"table/column/fk/rls/route/mounted proven; effective(flag via |
| FEAT-SETTLEMENT-RECOVERY-GL-JE | A | none/has-files | acceptance is empty/spec:NONE — owner must specify the functional contract |
| FH-VERIFY-finance-hub-modules | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| fk-safety-events-driver-status-0289 | tier2 | functional/no-files | goal defined but no named target files — owner/design names allowed_files, then buildable: {"check":"table/column/fk/rls/route/mounted proven; effective(flag via |
| STMT-3-1099-425c-consolidation | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |
| VOID-VERIFY-void-everywhere | — | no-spec/no-files | no .block-ready spec on disk — owner must author scope/decision |

## UNCLEAR (spec ambiguous)
| id | lane | summary |
|----|------|---------|
