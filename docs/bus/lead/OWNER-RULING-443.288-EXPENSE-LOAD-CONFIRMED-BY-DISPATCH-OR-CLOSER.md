# OWNER RULING 443.288 — every expense-to-load assignment is CONFIRMED by a person (10-23-2026 7:59 PM CT)

Owner, verbatim: "why are they on the wrong load, that is the real issue that should be fixed so it does not happen
again. and remember when setting on a load an expense, the dispatcher or closer whatever must confirm them. always.
i dont want to rely in a system that constantly fails."

## Measured root cause (Lead, prod read-only, 10-23 8:10 PM CT)

- 43 Dreamline "Fuel Card Discount" entries ($1,976.20) sit on a load their fuel no longer belongs to. The receipt moved
  (443.214, GPS truck at the pump); the discount did not.
- Why: the statement card difference is booked as a SEPARATE document (old: hand-written JE with no line id; main today:
  postStatementCardCreditAsExpense / postStatementCostDifferenceAsExpense) that COPIES the receipt's load at that moment
  and has NO structural link to its receipt — the receipt id is only in the memo text (which is also why
  verify-no-internal-payload-in-notes is red). Every load-move path selects the receipt by its fuel link, so the
  child document is never carried. AUTH-453 re-issues the 241 discounts the same unlinked way: the next move would
  break them again.
- Second class (12 legs, 4 settlements P-0105/0107/0108/0109 + P-0115 open): settlement headers say one load
  (first_load_id = last_load_id) while their lines name 2–3. Writer fixed by the boundary engine (CC-1); data repair
  AUTH-454 (CC-2) — Lead is rehearsing it on a fork and running it on prod.

## The rule (owner decision — build exactly this)

1. NO expense lands on a load as final by machine alone. Every expense with a load (fuel receipt, Relay fill, statement
   card credit / card difference, settlement-entered expense, any expense) carries
   `load_confirmation` = `proposed` | `confirmed`, the engine's proposal evidence (truck at the pump, GPS distance,
   minutes off, load running / next load), `confirmed_by_user_id`, `confirmed_at`.
2. The engine PROPOSES (resolveFuelLoadAtTime / GPS truck at the pump). A DISPATCHER (Dispatch) or the CLOSER
   (Settlements Close) CONFIRMS or CHANGES it. Confirm / change runs through THE engine (reclassify by load + the whole
   expense family follows) with one audit row naming the person.
3. A settlement cannot close while any expense on its loads is `proposed` — the closer must confirm first. That is
   the "always".
4. An expense that is `confirmed` is never moved by a machine again (443.214-style re-attribution becomes a new
   proposal the person confirms).
5. A child document (statement card credit / card difference) is LINKED to its parent receipt
   (expenses.parent_expense_id FK + transaction_source_links role) and ALWAYS moves with it. A child never has its own
   load decision. Live guard: no child whose load differs from its parent's — ceiling 0.
6. Backfill: expenses on CLOSED settlements = confirmed by that settlement's closer (audit-stamped "confirmed at close");
   everything else with a load = proposed and appears in the queue.

## Assignment
- CC-2 (fuel / expense engines): 443.288-A parent link + family move + guard; 443.288-B load_confirmation columns,
  proposal writer, confirm/change engine + routes, settlement-close refusal.
- Cursor (UI): 443.288-C "Expense load confirmations" queue in Dispatch and in Settlements Close (multi-select,
  bulk confirm, change load with evidence shown).
- Codex (guards): 443.288-D guards for 1–6 with failing plants.
- Lead: AUTH-454 + AUTH-453 on prod after fork proof (443.287), then live verification of 443.288.
