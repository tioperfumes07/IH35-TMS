# LAW — BLAST RADIUS · NO VERTICAL FIXES (owner-approved 2026-08-31)

**Measured on `origin/main`, not asserted.** Handoff copy: `~/Downloads/IH35-HANDOFF-2026-08-31/`

## The evidence — three PRs for ONE state machine

| PR | Finding | What shipped |
|----|---------|--------------|
| #18473 | DISPATCH-NO-UI-DELIVERED-TRANSITION | a deliver button |
| #18507 | DISPATCH-NO-UI-DELIVERED-TRANSITION | a complete button |
| #18516 | DISPATCH-NO-IN-TRANSIT-UI-CONTROL | an in-transit button |

The fourth was already queued. Same root cause, three IDs, three merges.

**LoadDetailDrawer.tsx on main:**

- hardcoded status literals in transition controls: **9**
- references to `load-state-machine.ts`: **0**

`allowedTransitions` **already exists and is complete** in `apps/backend/src/dispatch/load-state-machine.ts`. The drawer ignores it.

**21 of the last 40 merges touched NO verify script.** A fix with no guard closes one instance and protects nothing.

## The law — five rules

1. **Every finding states its BLAST RADIUS before any fix ships:** how many rows / files / call sites carry the same defect, **with the query or grep pasted verbatim**. `"Found on load 13521"` is not a blast radius. N=1 is legitimate — but it must be **proved**.

2. **A fix that closes 1 of N does not merge.** Close all N, or split explicitly and assign the remainder an owner. No silent partials.

3. **No fix merges without a guard that makes the CLASS impossible** — a check for the pattern, not a test for the instance. `"No guard"` allowed once per finding, with a stated reason.

4. **If canon exists, IMPORT IT, never re-implement.** Known canon:
   - `dispatch/load-state-machine.ts` (`allowedTransitions`)
   - `dispatch/delivery-evidence-status.ts` (`isDeliveryEvidenceStatus`)
   - `catalogs.accounts.system_purpose` (never account numbers)

   Re-implementing canon **IS the defect**, even when the values match today.

5. **One defect, one ID.** Do not file a new ID for the same root cause on a different row. Three IDs for one state machine is how the treadmill hides.

## PR shape — horizontal class fix (Cursor worked example)

**One PR replaces #18473 / #18507 / #18516 and every future vertical button PR.**

`allowedTransitions` is already complete in `load-state-machine.ts`.

1. Expose it to the FE as the **single source** (shared module `@ih35/shared-types` or an endpoint returning `allowedTransitions[currentStatus]`). **DO NOT copy the table into FE source.**
2. `LoadDetailDrawer` renders **one button per allowed office transition** from that data. Delete all hardcoded transition literals.
3. Terminal status renders no buttons — `isTerminalLoadStatus()` already answers it.
4. Labels from **one map**. Adding an enum value must not require touching the drawer.

**Guard:** `scripts/verify-load-transitions-from-state-machine.mjs` — FAIL when any FE component hardcodes a `load_status_enum` value in a transition control, or when a status in `allowedTransitions` has no rendered control. `--selftest` plants both.

## Blast-radius queries owed (before next fix in each lane)

| Lane | Class | Query owed |
|------|-------|------------|
| **CC-1** | `LOADS-MILEAGE-INTEGER-TRUNCATION` | How many loads already stored at integer precision + total driver-pay delta. Column is integer — truncates **every** import. |
| **Cascade** | `live_load_number` | 11 self-referential, 0 real legacy refs, 56 NULL. Revert the 11. |
| **CC-3** | `INVOICE-ORPHAN-REVENUE-OUTAGE-COHORT` | 37 of 37 drafts. Confirmed. |
| **CC-3/CC-1** | delivered-status drift | 4 call sites + 1 re-declaration. Confirmed. |
| **Cursor** | `DISPATCH-NO-*-UI-CONTROL` | N = every transition in `allowedTransitions`. |

## Four-line summary (paste to seats)

State the blast radius (with the query) before any fix ships · a fix closing 1 of N doesn't merge · no fix merges without a guard that kills the class · if canon exists, import it — re-implementing canon is the defect.

## Evidence block (required on every PR)

```
BLAST RADIUS:
  class: <one sentence>
  measure: <grep or SQL — verbatim>
  N: <integer>
  horizontal_fix: <shared helper / import canon / one migration>
GUARD: scripts/verify-<name>.mjs
```

Presence: every `docs/bus/INBOX-*.md` TOP references this file.
