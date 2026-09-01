# OUTBOX-CC-2 · working log (archive older: `docs/bus/archive/OUTBOX-CC-2-2026-09-01.md`)

FORCE NOW | READ INBOX-CC-2 | GO-08 document-create DO UPDATE leftover | 18-series CLOSED | NEVER #19305 | GO

---

## ★ CC-2 | ACK | GO-14 | GO-08 DOC-CREATE UPSERTS · 2026-09-01T21:10Z

**GO-08 document-create DO UPDATE count = 0.**

```
grep -rn "ON CONFLICT" apps/backend/src/accounting/invoices.routes.ts \
  apps/backend/src/accounting/bills.routes.ts apps/backend/src/accounting/expenses.routes.ts \
  apps/backend/src/accounting/payments.routes.ts apps/backend/src/accounting/credit-memos.routes.ts \
  apps/backend/src/accounting/vendor-credits.routes.ts apps/backend/src/dispatch/book-load.service.ts \
  apps/backend/src/mdata/loads.routes.ts
```
Zero hits — not one `ON CONFLICT` clause of any kind (`DO UPDATE` or `DO NOTHING`) in any of the 7
document-create route files (invoice/bill/expense/payment/credit-memo/vendor-credit) or the two
load-create paths (`book-load.service.ts`, `mdata/loads.routes.ts`). Cross-checked against the
already-counted 72: none of the 41 production files in that list is one of these 8. Every real
document-create in this codebase either has no `ON CONFLICT` at all (bare `INSERT`, relying on the
unique index + a `23505` catch mapped to 409 — book-load's `SAVEPOINT book_load_insert` pattern,
already verified this session) or does its own pre-check via `assertLoadNumberAvailable`/
`resolveXDisplayId` before inserting. Not sending this class back through the 18-series; not
touching Settlement/Cash Advance Request (already routed to CC-1). Not touching #19305.

Idle, watching INBOX TOP only per the wake-rule fix.

---

## ★ CC-2 · SUBLEDGER-GL-TIEOUT-EVERY-CONTROL grep-verified OPEN, then executed · 2026-09-01T21:20Z

Grep-verified: row still `OPEN · routed=CC-2 · FORCE` on main. Executed (verify, not build):

**Old numbers retired.** GO-11's void pass zeroed the journal entries behind them: account 1150
(Unbilled Revenue) GL = **$0** (was $109,158.50), account 1000 (Operating Bank) GL = **$0** (was
-$41,255.43/-$46,955.43). Cross-checked via a direct `accounting.journal_entry_postings` sum
against `fn_account_balances_as_of` — both agree, genuine zero, not masked.

**New real variances, much smaller:** Unbilled Revenue now ties out clean ($0 subledger too — no
delivered-not-invoiced loads currently). Operating Bank: subledger (real bank_transactions,
non-voided) = **-$13,036.62** vs GL $0. Escrow (2100, not previously named): subledger
(`escrow_accounts.balance_cents`) = **$500.01** vs GL $0. Factoring/Prepaid: GL $0 on both,
subledger not computed this pass (ran out of budget). `fixed_asset_default` has no account
mapped for USMCA at all.

**Coverage gap:** `SUBLEDGER_GL_CONTROL_ROLES` covers 6 of the 8 controls the board row names —
**`cash_advance` and `insurance` have no tie-out code at all.** Not building them (GUARD lane).
The "daily named workflow shadow" ask is substantially already met by an existing hourly cron
(`checkExtendedSubledgerTieOutForCompany`), just not a GitHub Actions workflow specifically.

**CoA DRIVERCASHAD contamination is worse than last reported:** **29** test-named accounts, not
24 — only 6 deactivated, **23 still active**. Combined balance = $0 (also zeroed by GO-11), so no
money at risk, but 23 active fixture rows are still sitting in the real chart of accounts —
owner-disposition item.

Filed full evidence on the board row itself (same row, appended, not rewritten). Routed the build
work (2 missing roles, root-cause the 2 real variances) to CC-1; the 23-account disposition to the
owner. Nothing built, nothing deactivated, no money moved. Idle.
