# INBOX-CC-1 · 9223 · HONESTY BEFORE RECON · NO CATEGORIZE BOFA

`git pull --ff-only origin main`. FAST-MERGE 4–5 min. USMCA. Reuse poster. No new GL math.

**LEAD 2026-08-21 18:44 CT — OWNER: live+verified only. TMS-native USMCA rows are TEST. BofA is a real bank connection. Do not categorize or reconcile bank feed until labels/registers are honest.**

**Do NOT:** Match / Categorize / recon the For-review Plaid queue. UI showed **For review · 230**. Neon same session (`ih35_app` + `app.operating_company_id=USMCA 5c854333-…`): **312** `banking.bank_transactions` · **277** `review_state=for_review` (0 `matched_journal_entry_id`) · **35** `matched` (34 with JE). Do not invent why 230 ≠ 277 (account/date filter). Do not close the gap by posting.

**LIVE (Neon `br-fancy-credit-akjnd07a` + Chrome SHA `fe62c92`):** CoA register `c7af1219-f6a6-4169-a2d8-8f556fb0c2f3` (USMCA FREIGHT ···3224), window 2026-07-01..2026-09-30: **69** non-voided postings, **66** `source_transaction_id` UUID-shaped, **69** nonempty `je.memo`, **0** `qbo_journal_entry_id`. Chrome Ref No. = **Journal entry — not visible** because `account-register.service.ts` sets `reference: p.source_transaction_id`. Memos include TEST/SAMPLE and raw UUIDs (`Bank categorization 94d30341-… posting`). Painting memo as the Ref label is still dishonest.

**ACCT-F5708** (`bill_number` COALESCE) is on `origin/main`, **not** on live `fe62c92`. Re-prove on live SHA after batch deploy. Do not re-open as “missing on main.”

Do **not** idle. Do **not** deploy. Do **not** flip `ENABLE_SCHEDULED_REPORTS_WORKER`.

## PASTE BOX

```text
===== CC-1 · PORT 9223 · HONESTY BEFORE BOFA RECON =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-1.md
FORBIDDEN: categorize/match/recon Plaid For-review · trigger_deploy · worker ON · guess 230=277

NOW (this order):
  1) ACCT-REGISTER-REF-IS-SOURCE-UUID
     apps/backend/src/accounting/account-register.service.ts reference := human id
     (bill_number / invoice display_id / bank txn display_label / JE memo WITHOUT raw UUID)
     NOT source_transaction_id UUID. Guard: UUID-only reference must fail; WAVE3-TEST-INV-0001 / BILL-2026-00012 must name.
     Do not use entityLabel(memo) if memo still embeds a UUID as the identity.
  2) Re-prove ACCT-F5708 on live SHA after Cursor batch deploy (not now)
  3) Settlement close USMCA TEST DATA only — 0 closed is unpaid; do not invent BofA matches
  4) Cron stagger PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED — code only

ACK: CC-1 | ACK | INBOX-CC-1 | PORT=9223 | NOW=register human reference NOT categorize | GO
===== END CC-1 =====
```
