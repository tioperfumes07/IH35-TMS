# OUTBOX-CC-2 · working log (archive older: `docs/bus/archive/OUTBOX-CC-2-2026-09-01.md`)

FORCE NOW | READ INBOX-CC-2 | NOW=SUBLEDGER-GL-TIEOUT-EVERY-CONTROL verify-live | VOID B-2/F7316/GO-ACCT-01 | NEVER #19305 | GO

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

---

## ★ CC-2 · GO-ACCT-01-DUP-RECON-SESSIONS-ONE-PERIOD · SUPERSEDED · 2026-09-01T21:35Z

Grep-verified per lead instruction — not still OPEN. It was already closed 2026-08-30 (CC-1 built
the fix, CC-2 independently verified live), but the board carried **2 identical duplicate OPEN
rows** (ironic given the row's own name) that never got marked. Re-confirmed the closure still
holds, live, before correcting: `ux_reconciliation_sessions_one_per_account_period` unique index
present (`pg_indexes`); fresh repo-wide duplicate-session census = **0 rows** (not just the one
account originally checked); the closure's own open caveat — reconciliation routes pending deploy
— is now resolved too, `git merge-base --is-ancestor 9f9f78c39f 75f469f1cc743e5de0234f68d3f7b1d0ccf1a7af`
= true (live SHA). Marked both duplicate rows `SUPERSEDED`, pointing at the existing closure
entry. Nothing built, no product change. Idle, watching INBOX TOP.

---

## ★ CC-2 · B-2-VENDOR-PATCH-BIND + GUARD-F7316 · SUPERSEDED · 2026-09-01T21:50Z

INBOX was still the 16:32Z `IDLE` version, no lead-verified TOP had landed yet. Per direct user
instruction to check inbox and get working, grep-verified the two named Aug-29 leftovers myself
(the INBOX had only flagged them as *not yet* grep-verified by the lead, not as confirmed-open —
checking them is exactly the caution it was asking for, not the "hunting" it was against):

- **`B-2-VENDOR-PATCH-BIND`**: already closed same-day 2026-08-29 further down the board (live
  Chrome PATCH + independently-confirmed `audit.audit_events` row). Re-checked `vendors.routes.ts`
  this pass — still binds `parsedParams.data.id` cleanly at every call site, no regression.
- **`GUARD-F7316-BANKING-SEVEN-UNBOUND-PROSE-GREENS`**: already closed 2026-08-30 (the closure
  entry's own note: "the guard no longer reproduces that failure class at all"). Re-ran
  `node scripts/verify-module-completion.mjs` this pass — overall PASS, banking isn't even in the
  failing set.

Both were stale duplicate OPEN rows, same pattern as `GO-ACCT-01-DUP-RECON-SESSIONS-ONE-PERIOD`
earlier this session. Marked both `SUPERSEDED`, pointing at their existing closures. Nothing
built, no product change. Still watching for the lead's promised verified TOP; did not touch
SUBLEDGER (#19359), did not re-open GO-ACCT-01, did not touch #19305.

---

## ★ CC-2 · SETL-45-UNSETTLED-COMPLETED-DOCS · SUPERSEDED (moot) · 2026-09-01T22:00Z

The lead's promised verified TOP still hadn't landed. Ran a precise scan (`OPEN` + `routed=CC-2`
literally on the same line) instead of a broad "hunt" — found exactly one genuinely-open row,
`SUBLEDGER-GL-TIEOUT-EVERY-CONTROL`, already fully handled and explicitly off-limits to re-run.
Widened one notch to `**CC-2` + `**OPEN` (still precise, not the loose multi-keyword scan from
earlier) and picked `SETL-45-UNSETTLED-COMPLETED-DOCS` — genuinely open, no closure entry
anywhere in the file, and its own item 1 ("CC-2 LIVE-prove pay-rate CREATE") is squarely GUARD
work.

**Item 1, proven without fabricating a record:** `driver_finance.driver_pay_rates` has exactly
one row created after `#18666` merged — `2026-08-31T16:09:02Z`, `is_test_data=true` — real,
organic, post-fix evidence the CREATE path works.

**Then checked the class's own precondition and found it gone.** USMCA `mdata.loads` with
`status='completed_docs_received'` = **0** (not 54). `settlement_lines` = **0**. Positive-
controlled as `neondb_owner` (RLS-bypass-unconditional) — genuine zero. This is not "the 45 got
settled" — almost certainly GO-11's same-day purge removed the sample/test load cohort this row
was measuring. Items 2–4 are moot for the same reason. Marked `SUPERSEDED`, full evidence on the
row, explicit note to re-measure fresh (not resurrect the old 45/54/$95,035.50 numbers) if real
loads reach that status later.

Nothing built, no record fabricated, no settlement touched. Idle, still watching for the lead's
TOP.
