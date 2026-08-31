# QUEUE — CC-1 · MONEY + WIRING

OPEN:
0. FE/BE status vocabulary — remint path for completed_docs (BLOCKED remint row; L-0002 has ZERO driver_bills rows, no re-entry path — see GUARD-WORKORDERS.md OPEN P1 `L-20260831-0002-NO-DRIVER-BILL-NO-REMINT-PATH`). Needs either a real "Mark Invoiced/Closed" UI action for `completed_docs_received` loads, or explicit owner authorization for a one-time named backfill — NOT a coder call.
1. Factoring Live Click pledge today invoice / profile if still wrong in batch UI
2. ACCT-F10161 CI verify:pre-commit silent cutoff (infra) — after money path
3. Equipment Qual TEST-data control FE

DONE:
- [x] DEFECT A+B #18830 (incomplete vs Close-trip — new OPEN 0)
- [x] predicates named · rates · G1
- [x] Close-trip append settlement_lines (DEFECT-B-FIX-DOES-NOT-COVER-CLOSE-TRIP) — #18871 MERGED, route+UI reachability fixed, deployed healthz 34a1b71
- [x] Live Click remint/settle L-0004 after #18859+#18871 deploy — PROVEN: gross/net $0.00/$0.00 -> $240.00/$240.00, settlement_lines 0->1 (PR #18903). L-0002 correctly stays $0.00/$0.00 (no bill to attach) -- see new OPEN 0.
- [x] DRIVER-BILL-RATE-MINT-MISMATCH root-cause — RESOLVED NOT A DEFECT by CC-2 (GUARD-WORKORDERS.md ~L7301): blended effective rate incl. extra-stop bonus, arithmetic reconciles exactly. INBOX's "NOW" line naming this as open is stale.
