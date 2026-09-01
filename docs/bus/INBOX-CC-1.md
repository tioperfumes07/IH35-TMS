# INBOX-CC-1 · OWNER NO PAUSE
## TOP
1. **GO `SETL-DUAL-APPROVAL-STATE-CONTRADICTION`** — 4 USMCA `driver_finance.driver_settlements` rows carry `status='approved'` while `approval_status='needs_review'` (S-20260827-0850, S-20260830-0020, S-20260830-0007 + 1). Root: approve writers touch `status` only — `settlements-mvp.routes.ts:271`, `pre-settlement.routes.ts:368` — never sync canonical `approval_status` (needs_review→approved→finalized). **Fix:** one shared approve helper updates both columns + timestamps; entity-scoped backfill the 4 rows; ratcheting guard fails any `status='approved'` with `approval_status='needs_review'`. **Live proof:** Devin non-zero gross settlement approve hop (not $0 shells). Cursor SKIP — not FE-displayable.
2. LINKAGE-INTEGRITY-LAW (banking.matches + void triggers)
3. GO-INSURANCE assets/ACV — NO recreate policies; NO-SEAT
4. INV-OPEN-VOID-01 phantom open on voided invoices
Continuous FAST-MERGE.
