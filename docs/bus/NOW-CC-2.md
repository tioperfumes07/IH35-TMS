# CC-2 — 2026-09-25 3:16 AM CT (08:16Z) — Lead: your hold is correct. The costs guard is NOT Cursor's now — it is CC-1's ROUND 153.1 item 4 (207 fuel_event + 11 handwritten cost JEs + 324 fuel JEs on 1090, plus correcting the guard's over-broad invariant 1), deadline 11:00Z. While it clears, build steps 2–4 (date cascade 3/7/From-To, eligibility != ranking with the remaining-difference counter, the filter bar) on the SAME rebased branch — same job, no switching. Put a LANE_CROSS line in the PR body for your verify-one-load-create-path DRIVER_BILLS fix. Merge the minute CC-1 posts 'costs guard green'.

---

# ROUND 153 — CC-2 — FINISH THE MATCH ENGINE. ONE JOB, START TO FINISH, NO SWITCHING.
Claude Lead, 2026-09-25 2:45 AM CT (07:45Z). Owner: *"get any of the claude coders finishing the match engine ... from start to finish."*
The design is decided — conversation register 09-23 Entries 1–5 + `claude/09-23-2026-OWNER-DECISION-BANK-MATCH-WINDOW-DATE-CASCADE.md`.
**Start from CODEX's finished branch `codex/round141-match-window` at `f373027e6b`** (window + atomic multi-candidate accept,
`variance_account_id` removed, selftest + 10/10 tests). It is NOT on main. You take it to main and finish the rest.

## BUILD, IN THIS ORDER
1. Rebase `f373027e6b` on main, gate exit 0, merge, deploy, live. LANE-CROSS line naming CODEX's files.
2. **Date cascade (owner-locked):** 3 days (bank −3/+1) default → auto-widen to 7 days (−7/+2) ONLY when step 1 is empty, and say so →
   never auto-widen past 7 → From/To. Retire `QBO_DAYS_BEFORE=90 / QBO_DAYS_AFTER=20` in `match.service.ts`.
3. **Eligibility ≠ ranking.** Amount demotes, never hides. Remaining-difference counter re-ranks as items are selected.
   Exact singles and exact 2–3-item combinations shown first, offered as one row.
4. **Filters:** type multi-select with live counts · amount From/To in integer cents · date · payee/vendor · customer · driver ·
   unit · trailer · load # · settlement # · memo text · unmatched-only. Chips + Clear all. Three empty states (no results /
   type has no link to that dimension / link empty on these rows). Sticky = type only.
5. **Classify before any button:** many-to-one → multi-select (no variance) · partial bill payment → bill stays open ·
   genuine short/over-pay → resolve-difference with REASON CODE (bank fee, processing fee, factoring fee, early-pay discount,
   FX, rounding, customer short-pay) → account derived, amount pre-filled. Never a bare account picker.
6. **Kinds:** `bill` persistable (Part 2b — real bill payment through the existing engine) · add `driver_bill` (all six parts:
   kind, candidate query, amount branch, CHECK migration, matched column, persistable only after posting through
   `settlement-bill-payment-posting.service.ts`) · JE amount = the posting on THAT bank account, not total debits.
7. **Law unchanged:** suggest-only, GET never writes, MATCH never adds, unmatch = void. bank_transactions never created/edited by you.
## GUARDS
`verify-every-match-kind-is-acceptable-or-declared` stays green; add `verify-match-window-contract.mjs` (cascade windows,
cents parsing, no amount-hiding, driver_bill six parts). Planted-RED each.
## PROOF
In Chrome on app.ih35dispatch.com (sha named): one real bank line matched to 2 documents summing to it; one resolve-difference with a
reason code; one partial bill payment. Paste the JE ids and the bank row id.
DONE line per step: `CC-2 | R-153.<n> DONE | <sha> | <live sha> | proof`. Deadlines: 1 → 10:00Z · 2–4 → 16:00Z · 5–6 → 22:00Z ·
proof → 23:00Z. Missed → CC-3 takes it. **No other work until the proof is posted.**

---

# NOW-CC-2 — 2026-09-24 05:15 UTC
## CURRENT (Round 152.1)
Banking: MATCH posts nothing; CATEGORIZE books. bank_transactions untouched by feed (1133).
Serve day gate; daily nine-figure reconciliation when Cursor days close.
