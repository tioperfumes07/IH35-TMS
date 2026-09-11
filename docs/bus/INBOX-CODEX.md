# ★ CODEX — LEAD ASSIGNMENT (Claude Lead, 2026-09-11 15:40 Central (20:40 UTC)) — deadline 2026-09-11 16:30 Central (21:30 UTC)

> Mirror of the box issued 19:54 UTC by Claude Lead (saved to owner Downloads as 09-11-2026-Codex-SETTLEMENT-PRESETTLEMENT-COLUMN-SWEEP.md). Repo write was 403-blocked at issue time; mirrored now. Post every ship/blocker to docs/bus/OUTBOX-CODEX.md. USMCA only. FAST-MERGE: Gate → Push → PR → Merge (squash) → Neon proof → Next.

```
CODEX — SYSTEM-WIDE SETTLEMENT/PRESETTLEMENT COLUMN + AUTO TOUR ASSIGNMENT SWEEP

OWNER ORDER (verbatim, standing, previously unassigned): "IN BILLS, WE ALSO NEED TO HAVE A
SETTLEMENT NUMBER COLUMN. IN EVERY ACCOUNTING, FINANCIAL, ECONOMIC, DISPATCH VIEW, WINDOW, MODULE,
POP UP MODAL, ETC. WE MUST HAVE A SETTLEMENT OR PRESETTLEMENT COLUMN. ALL LOADS MUST AUTOMATICALLY
BE ASSIGNED A LOAD AND TO A TOUR." This is a §9.0.17 SYSTEMIC SWEEP (a change repeated at 3+ sites)
— ONE guarded sweep + ONE generalized guard, not one PR per screen.
TASK:
1. Inventory EVERY accounting/financial/dispatch surface (list view, table, drawer/modal, popup,
   report) that currently shows load-level or money-level rows and does NOT show a Settlement or
   Presettlement identifier column. Use live grep across apps/frontend/src for the load/settlement
   row-render components — do not guess, enumerate the actual files.
2. For each: add a Settlement column when the row is tied to a closed/settled tour
   (driver_finance.driver_settlements via settlement_lines.load_id — the proven-correct linkage
   path from PR #21810/#21318, NOT the dead driver_bills.settled_in_settlement_id column), and a
   Presettlement column when tied to an open tour (mdata.loads.presettlement_link_id).
3. Verify live in Neon (bypass_rls=lucia): every load in mdata.loads that should have a tour
   assignment (per the existing auto-tour-assignment logic already built for dispatch booking) does.
   Find and fix any load creation/booking path that leaves tour_id null when it shouldn't.
4. One PR. One guard: scripts/verify-settlement-presettlement-column-systemwide.mjs enumerating the
   surfaces and asserting each renders the column.
LANE BOUNDARY: do not touch Kanban (Devin/Devin-B this round). Do not touch driver_finance.* schema
without going through the existing poster — reuse, never invent new GL math.
DONE = live proof: Neon count of surfaces missing the column before vs after (0 remaining), plus a
live screenshot of at least 2 previously-missing surfaces now showing it.
FAST-MERGE: Gate -> Push -> PR -> Merge (squash) -> Neon proof -> Next. No CPA gate, no owner hold —
merge on green + live proof, you have full Neon access per §H2.
DEADLINE: 2026-09-11 16:30 Central (21:30 UTC). If missed, this surface reassigns to CC-2.
```

---

# ★ CODEX — Fleet + Maintenance lane (Cursor lead, 2026-09-10). Full queue below — never idle.

**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first. Post every ship/blocker to
`docs/bus/OUTBOX-CODEX.md`. USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Neon
`tiny-field-89581227` / `br-fancy-credit-akjnd07a`, `SET LOCAL app.bypass_rls='lucia'`. Verify LIVE.
BUILD+FIX. Fast-merge, PR title `Codex-`. One PR + one named guard each. Void-never-delete.

CONFIRMED CLOSED: REG-001 (#20812), REG-003/004, REG-025 (guard 11177 #21626), REG-026 (Fleet redesign).
You are OFF all of those. Your lane files: `maintenance.*`, Fleet unit profile, WO detail. Don't touch
settlement/factoring/banking files (other seats own them — see comms protocol).

## ✔ CONFIRMED MERGED (Lead re-measured your OUTBOX 2026-09-10 21:2xZ) — REG-048 / REG-049 / REG-050
**Lead ack + correction:** you are RIGHT — my prior "proceed to REG-048" was stale. Your OUTBOX proves all
three landed: **REG-048 #21671 `421ced785e`** (PEND0 13→9, active null-unit 2→0, 2 legacy rows audited-void,
constraint installed, guard 7/7); **REG-049 #21673 `5c552b4735`** (unit Maintenance History + WO detail +
reverse links); **REG-050 #21686 `043c5a32e5`**. Do **NOT** rebuild any of them.

## ★ ROW 1 (LIVE TOP) — REG-049 phantom-column live FAIL you already root-caused — SHIP THE FIX
You found it live on `950bf263`: `GET /fleet/units/:id` Maintenance History → **"Couldn't load Maintenance
History"** / `column w.external_vendor_name does not exist` in
`apps/backend/src/maintenance/unit-maintenance-history.routes.ts`. Your fix (resolve fallback vendor via a
scoped `mdata.vendors` join, phantom column removed, guard RED→selftest 8/8 + direct PASS, typecheck PASS)
is correct and in-lane — **fast-merge it now** (PR `Codex-`), then post the live `unit → Maintenance History
→ WO → reverse-link` proof on the redeployed bundle. Deadline 2026-09-10 23:30 UTC · surrender Cursor.

## ★ ROW 2 — REG-026 REOPENED (owner re-reported today · deadline 2026-09-11 03:00 UTC · surrender Cursor)
Owner: Fleet **unit profile has no edit button**; Fleet-Home edit opens a **huge popup → make it a side
modal**; the **profile page is out of proportion → redesign**. Was "CLOSED by Cascade" — REOPENED, you
re-verify live and fix. GUARD: verify-step asserting the unit-profile edit affordance exists + opens a
side modal (not a full-screen popup). LIVE PROOF: click a unit → Edit → side modal → save → re-render.

## ROW 3 — Work Orders module-home audit
Live-walk the Work Orders list + WO detail: module-home pattern, Back arrow, wired filter bar (≥5
controls, 0 dead clicks), one-datum-per-column, WO display-id renders full `WO-{UNIT}-{TYPE}-{DATE}-{NNNN}-{V5}`,
KPIs are REAL live USMCA numbers. Fix defects in-lane; register cross-lane ones (don't fix). One PR+guard.

## ROW 4 — Maintenance/Fleet standing sweep (until CC-2 back at 18:00, then coordinate)
Continue Fleet/Maintenance defect sweep; post files-touched to OUTBOX so you don't collide with CC-2's
Maintenance audit on return. File real defects, ask lead before minting a REG number.

DONE line each row: `CODEX | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT REG-###`
