# ROUND 153.7 + 154.2 — ALL SEATS — LEAD RULINGS. THE OWNER IS NOT THE MESSENGER TONIGHT.
Claude Lead, 09-25-2026 4:07 AM CT (09:07Z).

Owner, 4:06 AM CT: "THIS IS THE LAST COPY PASTE BOXES FOR TONIGHT I DONT WANT TO BE MESSENGER TONIGHT."
From here on, every seat reads the top of its own `docs/bus/NOW-<SEAT>.md` on origin/main **before every step and after every merge**. The Lead posts rulings there and nowhere else. A seat that needs a decision writes `DECISION NEEDED` at the top of its NOW file. The Lead answers there, and the coordinator (`~/ih35-worktrees/lead-coordinator.sh`) pokes the tmux seats. Nobody routes through the owner.

---
## CC-2 — R-153.6 blocker ANSWERED. Do not stop; continue steps 2–3 on ALL rows.
1. **Rail (owner-stated fact, not a guess):** USMCA buys fuel on **two providers only: Relay and Dreamline.** USMCA runs its fuel on the IH 35 Transportation **Relay** account, which is USMCA's Relay Fuel Wallet **1295**, funded by Amex-Scentsx. So:
   - Dreamline-confirmed rows → **2510**;
   - every other real USMCA fuel row → **Relay 1295**.
   - No card statement is needed to pick the rail. Note "owner-stated rail, R-153.7" in the expense memo and in the CSV evidence column.
2. **Dedupe BEFORE posting.** Your finding says the 292 rows carry settlement-document references (`5773-DEF-1`, …): they are fuel lines from the AlwaysTrack settlement documents. A Dreamline statement row that matches a settlement-document fuel line (unit + date + amount, ±$0.01) is **the same fill**. Keep ONE row: the one linked to the settlement line, with the Dreamline rail. Void the other as `duplicate of <id>` through the void engine.
   - The target is the parity ruler: USMCA fuel = **110,072.33 over 171 lines**.
   - 99 + 292 = 391 rows = 175,738.66 is **65,666.33 over**. Every dollar of that difference ends as a void (duplicate, or TRANSP truck) or as a line-by-line residual in the CSV.
3. **The deadlock is resolved this way (no bypass):**
   1. Rehearse the full repost on a **Neon child branch** of `br-fancy-credit-akjnd07a`.
   2. Run the same audited run-once script on production from your branch, the same way CC-1 ran #22569.
   3. The costs guard then measures green on live data.
   4. FAST-MERGE the writer + script + CSV + guard scope in the normal loop, gate exit 0. Never merge while red.
4. **Step 4 (guard scope) moves to CC-3** (below). Cherry-pick CC-3's branch `cc3/costs-guard-scope` before your final guard run.
- Deadline unchanged: guard green on main by **13:00Z**.

## CC-3 — step 3 is done. New work, same blocker: R-153.6 step 4 (guard scope only).
Branch `cc3/costs-guard-scope` off origin/main. In `scripts/verify-costs-are-expenses-not-handwritten-jes.mjs`:
1. Exempt `factoring_advance` (134), `driver_settlement` (101) and `factoring_default_interest` (86) from invariant 1 by `source_transaction_type` on the postings table ONLY. Each gets a named comment explaining that it is a document engine, not a hand-written JE. List the 86 default-interest JE ids in the PR body: not owner-approved (R-101.2); untouched.
2. Review the 11 `journal_entry` cost JEs one by one (measured: 11 JEs, Dr 5xxx 180.00 total). For each: the source document, and whether it gets an expense row through the expense engine or stays hand-written with the reason. Post nothing. Write the table in the PR body and at the top of NOW-CC-3.
3. Replace the stale "Cursor fixes the WRITER / OUTBOX-DEVIN-B" text (lines 39–40, 295, and the gate comment) with "CC-2 owns the writer (R-153.6); CC-3 owns guard scope (R-153.7)".
4. Selftest fixtures for each exemption, plus one proving a fuel_event JE is NOT exempt.
5. Push the branch and write its sha at the top of NOW-CC-2. The coordinator wakes cc2. **Deadline 11:00Z.**
- Your LAW 5 branch still FAST-MERGEs the minute the guard is green.

## CC-1 — items 2–3 DONE (verified on main: #22569 54aca75782, #22570). Continue in order, no stopping.
- The $485.00 gap ($299,247.00 vs Faro $298,762.00, 33 invoices) goes to item 11 as you said. Carry it by name.
- **Now:**
  - item 5 (feed-is-whole manifest label);
  - item 6 (the five self-carried invoices 009, 010, 026, 055/13555, 074/13593 = $12,592.40, not Faro purchases);
  - then items 7–11 (audit/correct feed, cash advances as bill payments, CoA per posting, full ledger reconciliation, linkage).
- FAST-MERGE each and put a DONE line on NOW-CC-1.
- Do not touch fuel: fuel is CC-2's.

## CODEX — R-154.2: your four design corrections are ACCEPTED as written. Build them.
1. `next_check_number` is **nullable** and initialization-gated. The first number comes from the owner on the Print Checks screen. Until then, print is refused with `CHECK_STOCK_NOT_INITIALIZED`.
2. The lifecycle gets the intermediate state: `print_status IN ('not_set','need_to_print','printed_pending_confirm','print_complete')`. The invariant becomes: need_to_print ⇔ number NULL; printed_pending_confirm ⇒ number NOT NULL + batch item; confirm ⇒ print_complete or spoiled + requeue.
3. **Persistent batches:** `banking.check_print_batches` (id, company, bank_account_id, starting_number, check_type, created_by, created_at, confirmed_at, confirmed_by, outcome) + `banking.check_print_batch_items` (batch_id, source_kind, source_id, check_number, sequence, result `printed|spoiled`). RLS the same as the registry.
4. **Financial lines are immutable once posted.** A change of account, amount, line or bank goes through void + reissue only (existing void-document engine). Only memo and attachments stay editable, audit-logged. This replaces R-154 §4's PATCH rule.
5. Matching: accepted. Use the existing candidate kinds `expense` / `bill_payment` with check metadata. No third kind. The CC-2 note in NOW-CC-2 is still required: one line naming the function.
- Status line at the top of NOW-CODEX after every PR. Read the top of NOW-CODEX before every PR. Deadlines unchanged.

---

# NOW-CC-3 — archived 2026-09-25 (bus size-cap cleanup #2, CC-3 self-performed, same class as Q34). Full history (WORM, nothing deleted): `docs/bus/archive/NOW-CC-3-2026-09-25-2.md`.

# ROUND 153.6 pointer — Lead, 09-25-2026 3:53 AM CT (08:53Z): fuel/costs guard is now CC-2's (docs/bus/09-25-2026-CC-2-ROUND-153.6-...md). CC-1: items 2-3 only, do not touch fuel. CC-3: load boards step 3; the coordinator wakes you when the guard is green.

---

# ROUND 153.5 — ALL CLAUDE CODERS — THE LEAD COORDINATOR IS LIVE. NO SEAT GOES IDLE.
Claude Lead, 09-25-2026 3:36 AM CT (08:36Z).

CC-3 | 2026-09-25 3:39 AM CT (08:39Z) | R-153 STEP 3 COMPLETE, HOLDING ON COSTS GUARD

Steps 2+3 done on `claude/law5-one-source-per-number` (rebased, 0 behind main): all six load
surfaces read `load-cost-rollup.sql.ts` (Kanban badge, cost-list rows, dispatch-margin fixed this
round); linkage renders both ways (6 forward + reverse, guarded, live PASS 114/373/458/125/89
non-vacuous, 0 dangling FKs); unit/driver/trailer links filled on the shared Pre-Settlement/
Settlement register (were plain text, now real EntityLinks; trailer column added). Guards:
`verify-one-source-per-number.mjs` (9 SIX_SURFACES + planted-RED), `verify-load-linkage-renders-
both-directions.mjs` (9 surfaces). Both selftest PASS, both apps typecheck clean.

Still blocked on `verify-costs-are-expenses-not-handwritten-jes` (owner per R-153.6: now CC-2's,
was CC-1's; re-checked repeatedly, still red). Ready to FAST-MERGE the second it's green — gate,
push, PR, immediate squash-merge, deploy, healthz confirm, NOW-line — in one pass, no idle
CI-watch.

Step 4 (six-surface, three-document Chrome proof on 5769/5790/5803) next, once merged/deployed.

— CC-3
