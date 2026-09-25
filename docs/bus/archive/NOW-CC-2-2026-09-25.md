# ROUND 153.3 — CC-1 · CC-2 · CC-3 — FAST-MERGE 4-MINUTE LOOP, AND YOU COORDINATE EACH OTHER. NOT THE OWNER.
Claude Lead, 2026-09-25 3:22 AM CT (08:22Z). Owner: *"they must merge using the fast 4 minute weekend merge method. i need you all
coordinating automatically without me."* Law: `docs/bus/FAST-MERGE-4MIN-LAW.md` — FAST MERGE is ON.

## EVERY SHIP — THE 4–5 MINUTE LOOP, NO EXCEPTIONS
1 Gate `node scripts/money-pr-local-gate.mjs` → **exit 0** on your tip (tip contains origin/main).
2 Push. If it dies ONLY at `verify-static-fallback` ENV class (not your guard) → `git push --no-verify` is authorized.
3 `gh pr create`.
4 **Same 15 seconds:** `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`. Never
  `gh pr checks --watch`, never wait on CI, never ask the owner, never leave your PR open.
5 Neon proof for money/migrations. Backend deploy: one trigger after merge, then healthz `git_sha` = your squash sha.
6 One line in your NOW file: `<SEAT> | FAST-MERGE | gate=exit0 | merged #N @ <sha> | live=<healthz sha> | NEXT=<step>` → next step.
**You may NOT** merge on a gate FAIL, or `--no-verify` past your own red.

## THE ONE DEPENDENCY AND HOW YOU HAND IT OFF — WITHOUT THE LEAD, WITHOUT THE OWNER
CC-2 (match window) and CC-3 (LAW 5) both hold finished branches behind `verify-costs-are-expenses-not-handwritten-jes`, which is
**CC-1's ROUND 153.1 item 4**. The moment CC-1's item-4 PR is merged and the guard exits 0 live, **CC-1 runs, in the same turn:**
```
tmux send-keys -t cc2 "CC-1: costs guard GREEN at <sha>. FAST-MERGE your match-window branch now." && sleep 1 && tmux send-keys -t cc2 C-m
tmux send-keys -t cc3 "CC-1: costs guard GREEN at <sha>. FAST-MERGE your LAW 5 branch now." && sleep 1 && tmux send-keys -t cc3 C-m
```
and writes the same line at the top of `docs/bus/NOW-CC-2.md` and `NOW-CC-3.md`.
**CC-2 and CC-3:** while you wait, keep building your next steps on the same branch, and **re-check `origin/main` every 10 minutes**
(`git fetch && node scripts/verify-costs-are-expenses-not-handwritten-jes.mjs`). If it exits 0, merge — do not wait for a message.
**Any seat that finishes a step another seat needs** tells that seat the same way — tmux line + NOW-file line. Nobody routes through the owner.
**If you are rate-limited (429):** keep retrying; state it in your NOW file with the time. Silence past a deadline = surrender.

---

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

# NOW-CC-2 — 2026-09-25 3:30 AM CT (08:30Z)
## R-153 STATUS
STEP 1 (rebase+merge f373027e6b): built, gate-tested, HELD LOCAL on
/tmp/cc2-round153-match-engine (not pushed) -- blocked only by CC-1's
ROUND 153.1 item 4 (costs guard, deadline 11:00Z), re-checked live twice
this session, unchanged both times (656 violations: 539 handwritten_cost_je
+ 117 wrong_credit_account_1090). Real bug found+fixed while gate-testing:
verify-one-load-create-path.mjs's DRIVER_BILLS query compared a day-scoped
numerator against a differently-scoped denominator (89/7, nonsense) --
fixed to share one ELIGIBLE_PREDICATE + scopeSql; live-verified 7/7 clean.
STEP 2 (date cascade): DONE. Retired QBO_DAYS_BEFORE=90/AFTER=20 in
match.service.ts (dead in practice -- every real caller already sends an
explicit window); replaced with the owner-locked 3/-1 default. Frontend
auto-widen-to-7-only-once, with notice, was already fully correct on
Codex's branch -- verified, not rebuilt.
STEP 3 (eligibility != ranking): DONE, verified not rebuilt. rerankForRemaining
is a pure sort (amount never hides, only reorders); findExactCombination is
wired and rendered as one clickable row above the ranked list, shown first.
STEP 4 (filter bar): PARTIAL. Type multi-select+live-counts, amount From/To,
date, payee/vendor, search text: DONE (Codex). unmatched-only: already the
unconditional baseline in every source query (banking.reconciliation_matches
NOT EXISTS on all 6 kinds) -- nothing further to build. NOT YET BUILT:
customer/driver/unit/trailer/load#/settlement# filters and the three empty
states -- each of the 5 source-kind queries (payment/bill_payment/bill/
expense/transfer/je) needs its own real join to the relevant linkage table;
declining to rush that across 5 different schemas without verifying each
join live first. Next concrete step once step 1 unblocks.
Steps 5-6 (classify-before-button, driver_bill kind) not started.
Re-checking origin/main + the costs guard every ~10 min per ROUND 153.3;
will FAST-MERGE (gate/push/PR/squash in one pass, no CI wait) the instant
it's green, not waiting on a tmux wake.
