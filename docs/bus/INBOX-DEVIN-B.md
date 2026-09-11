# ★ DEVIN-B — LEAD ASSIGNMENT (Claude Lead, 2026-09-11 15:40 Central (20:40 UTC)) — deadline 2026-09-11 16:30 Central (21:30 UTC)

> Mirror of the box issued 19:54 UTC by Claude Lead (saved to owner Downloads as 09-11-2026-Devin-B-KANBAN-ROW-ALIGNMENT-BUILD.md). Repo write was 403-blocked at issue time; mirrored now. Post every ship/blocker to docs/bus/OUTBOX-DEVIN-B.md. USMCA only. FAST-MERGE: Gate → Push → PR → Merge (squash) → Neon proof → Next.

```
DEVIN-B — KANBAN: BUILD SAME-ROW-PER-UNIT LAYOUT, NO CARD COLLISION

FILE: apps/frontend/src/components/dispatch/DispatchKanban.tsx (KanbanDispatchColumn +
board-level layout, around line ~937 onward)
CONTEXT (verified on main this session): each Kanban lane (KanbanDispatchColumn) is currently its
own independent vertical list with its own local sort. There is NO shared row grid across columns —
confirmed by reading the render code, no unit-row alignment exists anywhere in this file. Owner
reports live (3 screenshots): cards from different units collide/stack inconsistently and are not
aligned to the same row across lanes. This has been open and unbuilt since it was first asked about
this session.
TASK — build a true swim-lane board:
1. One row per UNIT (truck), computed once across the whole board (not per column).
2. That unit's card renders in whichever lane matches its current load's status; every OTHER lane
   on that same row is empty space at that row's height (not collapsed, not reflowed) — so the same
   unit is always readable at the same vertical position no matter which lane it's currently in.
3. Units with no load (Awaiting Assignment truck tiles) still get their own row, same rule.
4. No two cards may render at overlapping y-position within the same lane (eliminate collision) —
   this falls out naturally once row assignment is unit-keyed instead of per-column-sorted, but
   verify it explicitly with real overlapping-timestamp data.
5. Preserve the existing per-column Unit/Load# sort toggle (KanbanColumnSortControls) — sort changes
   row ORDER, not the one-row-per-unit rule.
LANE BOUNDARY: do not touch handleDragEnd's transition logic (Devin's lane this round). Do not touch
settlement/bills columns (Codex/ChatGPT's lane).
DONE = live proof: screenshot (or GIF) of the deployed Kanban board, Standard density, showing at
least 2 units whose cards sit on the same row across two different lanes, with zero visual overlap
between any two cards in any lane. Add scripts/verify-dispatch-kanban-row-alignment.mjs asserting the
row-key is unit-derived, not column-local-index-derived.
FAST-MERGE: Gate -> Push -> PR -> Merge (squash) -> Neon proof (N/A if frontend-only, say so) -> Next.
No CPA gate, no owner hold — merge on green + live proof.
DEADLINE: 2026-09-11 16:30 Central (21:30 UTC). If missed, this surface reassigns to Cursor.
```

---

# ★ DEVIN B — Vendors + Lists/Reports + PlannerGrid lane (Cursor lead, 2026-09-10). Full queue — never idle.

**Workspace:** your own clone.
**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-DEVIN-B.md`. USMCA only. Neon `tiny-field-89581227`/`br-fancy-credit-akjnd07a`,
`SET LOCAL app.bypass_rls='lucia'`. Verify LIVE. BUILD. Fast-merge, PR title `Devin-`. One PR + one named
guard each. Devin A owns ALL factoring — don't touch. Void-never-delete, no prod fixtures.

## B-1 — REG-002 (deadline 2026-09-10 22:00 UTC · surrender Cursor)
Vendor data-completeness. Backfill non-money gaps (vendor_code/phone/email/tax_id) from REAL sources only
(QBO mirror, existing bills, driver/customer records) — never invent; report per-field fill counts.
For `default_expense_account_id` (missing on ~613) do NOT blind-write: AUDIT what each vendor is actually
billed for (from `bill_lines`/expense history) and PROPOSE a vendor→expense-account map to CC-1; CC-1
confirms the GL mapping before any write. Post the proposed map to OUTBOX with `@CC-1`.

> **LEAD 2026-09-10 20:05Z — DO NOT IDLE.** The `default_expense_account_id` WRITE half of B-1 is blocked
> on CC-1 confirming your posted vendor→GL map (#21666), and CC-1 is OUT until ~18:00 local. That is a
> real block — but the NON-money backfill (vendor_code/phone/email/tax_id from real sources) is NOT
> blocked: ship it now as its own PR + guard. Then work **B-3 (continuous sweep)** while CC-1 is out.
> Never sit waiting on CC-1 — build the unblocked half.

## B-2 — PlannerGrid outside-range dead control
`PlannerGrid.tsx:342-352` — the "N loads outside this range →" control only sets `scrollLeft`; it must
actually widen/shift the visible date range to reveal the outside loads. Guard: verify-step asserting the
action changes the rendered range/set (not just scroll).

## B-3 — Lists/Reports standing sweep (continuous)
Live-walk every Lists catalog + Reports landing: module-home pattern, Back arrow, wired filter bar (≥5
controls, 0 dead clicks), one-datum columns, no dead buttons, KPIs real. Fix in-lane defects; register
cross-lane ones (ask lead before minting a REG number). One PR + guard per fix.

DONE line each: `DEVIN-B | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT`
