# ROUND 157 — CC-1 STEP 0 DONE. Continuing job below. Full ALL-SEATS text:
`docs/bus/archive/NOW-CC-1-2026-09-25-16.md`.

## STEP 0 DONE — 2026-09-25 09:40 AM CT (14:40Z), before the 15:00Z deadline.
All 4 (b699d2ac→5310/6ff6b8fa→5400/9726b25b→5300/5ebb6624→5300): reclass JE voided, original 9000
expense voided, recreated through the writer with the correct category, posted. Full live proof
(new expense ids, new JE ids, reversal JE ids, trial-balance check) on `docs/bus/OWNER-AUTHORIZATIONS.md`
AUTH-012 CONSUMED block. USMCA trial balance: debit 251,795,629¢ == credit 251,795,629¢. 0 of the 4
reclass JEs remain un-reversed. PR #22643, merged main as `de8a5a60f0`.

One real bug found only after the production run (not caught by 2 clean rehearsal passes): the
posting step wrote a real balanced JE but skipped the writer's own header-flip
(`posting_status`/`posted_at`/`journal_entry_id` on the expense row) — caught via a live
RLS-bypassed read against the confirmed production branch, fixed same-minute with a same-
authorization follow-up script, verified live before reporting done.

## CC-1 — continuing books job, in order:
1. Set B (AUTH-009, 18 settlements, escrow) — BLOCKED: rehearsal found `driver_finance.settlement_lines`
   escrow_contribution rows are `is_active=false` (pre-existing, dated 2026-09-24) across all 18
   settlements, so a straight reverse+reclose posts $0.00 escrow. Needs a decision (reactivate those
   rows vs. another fix) before this is safe to run.
2. Close tours 13588+13600, post 12 held fuel expenses — BLOCKED: settlement doc 5812 shows $0.00/mile
   and negative net; the settlement engine hard-rejects negative net. Cross-checked against the same
   driver's other settlement — looks like a real data gap (~$1,727 potentially owed to the driver), not
   a script bug. Needs owner/Lead confirmation before closing.
3. Fill unit on 141 fuel expenses — DONE, 118 live (not exactly the cited 141; see archive-16 for the
   re-measured population), AUTH-011 consumed.
4. Owner's full per-type table (loads, driver bills, cash advances, tolls/scales/lumper, invoice
   lines, escrow, Faro daily) at the top of NOW-CC-1 — not started, next up.

CC-1 | 2026-09-25 9:40 AM CT (14:40Z) | STEP 0 DONE, proof above and on OWNER-AUTHORIZATIONS.md.
Posted to NOW-CC-2 and NOW-CC-3 the same minute per Lead's instruction. Moving to Set B/tour-close
blockers next — both need a decision before they're safe to execute; reporting rather than guessing
past them.
