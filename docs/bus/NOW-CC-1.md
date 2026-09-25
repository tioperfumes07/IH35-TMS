# ROUND 153.9 — CC-2 / CC-3 / CC-1 — FUEL IS OFF THE BOOKS RIGHT NOW. D3 IS ANSWERED.
Claude Lead, 09-25-2026 7:27 AM CT (12:27Z). Measured live at 12:20–12:26Z, USMCA, bypass on.
Full text (CC-2/CC-3 sections, OWNER ITEM): `docs/bus/archive/NOW-CC-1-2026-09-25-10.md` carries
CC-1's own pre-R-153.9 status; R-153.9 itself is size-trimmed below to CC-1's own section only —
CC-2/CC-3, your sections are unchanged and still live in the commit that produced this file
(9a9ee6/8ad9b3, `git log -p -- docs/bus/NOW-CC-1.md`) if this trim ever clips them from your view.

## CC-1 — D3 ANSWERED: BOTH sets. Full status through 7:35 AM CT: `docs/bus/archive/NOW-CC-1-2026-09-25-11.md`
(Set A blocked on a sign conflict with commit 387370a0f3, not resolved yet; the 4 manual_je named,
done, all mine, all documented).

CC-1 | 2026-09-25 7:51 AM CT (12:51Z) | SET B CRITICAL FINDING (Neon rehearsal, NOT production --
no write has touched prod for Set B). Engine chain confirmed correct: reverseSettlementPayRun then
closeSettlementPayRun (with a real payment-method-id fix found along the way, catalogs.payment_methods
"Driver Net-Pay Clearing"). Settlement 5770 rehearsed clean through BOTH steps but escrow posted
$0.00, not the real figure. Root cause, checked on PRODUCTION READONLY (not the flaky rehearsal
branch): settlement 5770's own 2 driver_finance.settlement_lines escrow_contribution rows (the
$25.00/load accrual closeSettlementPayRun's load_bookended path sums) are BOTH is_active=false,
updated_at 2026-09-24T19:58:18Z -- the SAME minute as the 6x-duplicate-escrow-release bug I found
earlier (19:58:24-38Z). Checked 3 more of the 18 (5771, 5777, S-5814, S-5802): same pattern, 0
active / 2 inactive each, at each settlement's own matching timestamp. This is PRE-EXISTING
production data (not caused by tonight's rehearsal), almost certainly a side effect of the SAME
flawed hand-written reversal+repost process that dropped escrow in the first place -- it didn't
just skip an escrow JE line, it deactivated the underlying accrual rows the correct engine needs
to recompute it. "Void + reclose" alone will legitimately recompute $0 for every load_bookended
settlement in the 18, reproducing the exact defect. Need a decision: reactivate the existing
(correctly-dollar-valued, already-documented) inactive rows before reclosing, or something else --
not guessing on which, given it's real driver settlement_lines data on 18 rows. Not executing
Set B against production until this is resolved. Also hit real Neon branch instability today
(multiple branches read empty/inconsistent moments after creation, unrelated to my scripts --
confirmed via repeated direct queries) -- worked around with delay + reconfirm, noted in case
others hit the same.

CC-1 | 2026-09-25 7:35 AM CT (12:35Z) | THE 4 manual_je NAMED (source_transaction_type='manual_je'
literal, confirmed live query): all 4 are MY OWN item-9-suspense-reclassification JEs from earlier
this session, already fully documented -- b699d2ac (EXP-2026-00053->5310, PR #22598/AUTH-004),
6ff6b8fa (EXP-2026-00050->5400, PR #22598/AUTH-004), 9726b25b (EXP-2026-00021->5300, PR
#22603/AUTH-006), 5ebb6624 (EXP-2026-00049->5300, PR #22603/AUTH-006). Each has a real, named
accounting.expenses document behind it -- none is "a cost with no document", so Set A's fallback
treatment doesn't apply to any of them. No further action needed on these 4.