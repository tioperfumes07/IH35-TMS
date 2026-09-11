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
