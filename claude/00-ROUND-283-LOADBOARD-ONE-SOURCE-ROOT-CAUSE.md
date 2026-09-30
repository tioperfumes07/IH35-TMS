# ROUND 283 — THE LOADBOARDS: ROOT CAUSE FOUND · **CURSOR**
# Claude Lead · 09-30-2026 · Closes register #24 #25 #26 #27 #28 #29 and 280.18.
# Obey `00-SEAT-CONTRACT.md` + laws 280.0.a/b/c. **Linkage and count claims by QUERY, never a screenshot.**

## THE DEFECT — one missing `else`, in `apps/backend/src/mdata/loads.routes.ts` (~line 624)
```
if      (draft)                     -> draft filter
else if (status && status.length)   -> filter by status
else if (board_scope === "live")    -> live open-dispatch predicate
else if (board_scope === "history") -> history predicate
                                    <- NO ELSE. NO STATUS FILTER AT ALL.
```
`board_scope` is declared `z.enum(["live","history"]).optional()` (line 187). **A caller that passes neither
`status` nor `board_scope` receives EVERY load in the company — closed, cancelled, settled, billing-tail.**

## WHO PASSES IT — measured, every consumer of `listAllLoads`
| Consumer | board_scope |
|---|---|
| `planners/planner-bars.ts` (`usePlannerLoads`) | **"live"** |
| `Dispatch.tsx` — **the main dispatch page** | **none** |
| `LoadCostsBoardPage.tsx` | **none** |
| `DispatchLoadCostsPanel.tsx` | **none** |
| `CustomerDetail.tsx` | **none** |
| `api/loads.ts` (default) | **none** |

**One of six filters. Five do not.** That is why the boards never agree — it was never a predicate disagreement,
it is one view filtering and the rest not filtering at all.

**This breaks the owner's 2026-09-11 law by omission:** *"DISPATCH OPEN-ONLY SCOPE / STRIP CLOSED LOADS
EVERYWHERE, NO EXCEPTIONS — Dispatch and everything inside it renders ONLY current/open loads, never
closed/settled/billing-tail data; that belongs to Settlements."*

---

# 283.1 — FAIL CLOSED. THE PERMANENT FIX.
Add the missing `else` so an unscoped call **cannot** return closed loads:
```ts
} else {
  // No status filter and no board_scope: Dispatch is OPEN-ONLY by owner law
  // (2026-09-11). Default to the live predicate. Returning every load was the
  // defect — a caller must OPT IN to history, never fall into it.
  filters.push(liveLoadsOpenDispatchExistsSql("l.id"));
}
```
**Fail closed, not open.** A caller that forgets `board_scope` gets the safe answer, not the whole table.

# 283.2 — MAKE THE SCOPE EXPLICIT AT EVERY CALL SITE
Each of the five declares what it wants — no silent defaults:
- **`Dispatch.tsx`** → `"live"`. It is the dispatch board; open-only by law.
- **`LoadCostsBoardPage.tsx`** and **`DispatchLoadCostsPanel.tsx`** → decide and state it. Load costs for the
  **current trip** is `"live"`; a historical cost report is `"history"` and belongs in Reports.
- **`CustomerDetail.tsx`** → a customer's load history is legitimately `"history"` or both — **it is not a
  Dispatch surface, so the open-only law does not bind it.** State which and why in the PR.
- **`api/loads.ts`** → no implicit default in the client either.

# 283.3 — THE GUARD (canonical guard set, 282.6)
**No call to `listAllLoads` may omit both `status` and `board_scope`.** Static check over the frontend; fails the
build on a new unscoped caller. Ratcheted, starting count = today's unscoped callers. Register in `LAW.json`.

# 283.4 — PROVE IT BY QUERY, NOT BY SCREENSHOT (law 280.0.c)
For the same company and date range, every load view must return the **same count and the same load ids**:
Dispatch board · Kanban/List · Trip Pairing · Timeline · Load Costs.
**Paste the counts side by side.** Today's live truth for USMCA: **14 active loads on 12 units**, 86 closed,
23 invoiced, 13 completed-docs, 13 cancelled. A board showing anything other than 14 is filtering wrongly.

# 283.5 — THEN THE UI ITEMS (#26 #27 #28 #29)
Return-trip double rows · unit ordering after 176 · column order · transit line (green, animated, centred,
draggable) · row height and per-load dropdown and universal filter · responsive width.
**Do these AFTER 283.1–283.3.** Several of them are probably symptoms of the unfiltered query — a board rendering
closed loads shows duplicate rows and wrong ordering for free. **Re-check each one after the fix before building
anything.**

## ALREADY RESOLVED — do not re-investigate
**#24 "board 11 vs 14 vs 16" is NOT a count bug.** Measured live: **14 active loads**, **12 units** running them
(two units carry two loads), and **16** is the viewport target from the owner's own row-height ruling — *"cap the
row height so 16 units fit in view."* Three different quantities shown as bare numbers. **The fix is labels, not
filters.**
