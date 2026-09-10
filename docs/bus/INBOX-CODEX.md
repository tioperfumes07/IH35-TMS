# ★ CODEX — Fleet + Maintenance lane (Cursor lead, 2026-09-10). Full queue below — never idle.

**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first. Post every ship/blocker to
`docs/bus/OUTBOX-CODEX.md`. USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Neon
`tiny-field-89581227` / `br-fancy-credit-akjnd07a`, `SET LOCAL app.bypass_rls='lucia'`. Verify LIVE.
BUILD+FIX. Fast-merge, PR title `Codex-`. One PR + one named guard each. Void-never-delete.

CONFIRMED CLOSED: REG-001 (#20812), REG-003/004, REG-025 (guard 11177 #21626), REG-026 (Fleet redesign).
You are OFF all of those. Your lane files: `maintenance.*`, Fleet unit profile, WO detail. Don't touch
settlement/factoring/banking files (other seats own them — see comms protocol).

## ROW 1 — REG-048 (NEW, measured live 2026-09-10 · deadline 2026-09-10 23:00 UTC · surrender Cursor)
MEASURED: `maintenance.work_orders` USMCA = 17 rows; **13 have display_id containing `PEND0`** (V5 suffix
never finalized) and **2 have `unit_id IS NULL`**.
TARGET (Rule 03 §WO): `refresh_wo_display_id` must set V5 from the FIRST vendor/parts invoice
(`external_vendor_invoice_number`/`external_vendor_wo_number`, or first `parts_invoice_links` for IS/IT,
or `LABOR` when `labor_only_no_parts`), and lock it once non-`PEND0`. Wire that refresh on invoice/parts
entry so PEND0 resolves. A WO with a unit that has no `unit_number` must be blocked with
`E_UNIT_HAS_NO_NUMBER` (never minted) — repair/void the 2 null-unit rows (void-not-delete) and add the
guard so a null-unit WO can't be created.
GUARD: verify-step asserting (a) refresh sets V5 from first invoice/parts and never recomputes after
non-PEND0, (b) WO create rejects null-unit. LIVE PROOF: a WO whose V5 flipped PEND0→real after invoice
entry + the 2 null-unit rows resolved.

## ROW 2 — REG-049 (NEW · deadline 2026-09-11 03:00 UTC · surrender Cursor)
TARGET: Fleet unit profile "Maintenance History" tab lists that unit's Work Orders (forward + reverse
linkage per Blueprint §9), each row clickable → WO detail; WO detail links back to the unit + load
(`load_id`) + vendor + GL. No dead-end, no orphan. GUARD: verify-step asserting the unit→WO join renders
and WO→unit/vendor/load back-links resolve. LIVE PROOF: click a unit → Maintenance History → a WO → back.

## ROW 3 — Work Orders module-home audit
Live-walk the Work Orders list + WO detail: module-home pattern, Back arrow, wired filter bar (≥5
controls, 0 dead clicks), one-datum-per-column, WO display-id renders full `WO-{UNIT}-{TYPE}-{DATE}-{NNNN}-{V5}`,
KPIs are REAL live USMCA numbers. Fix defects in-lane; register cross-lane ones (don't fix). One PR+guard.

## ROW 4 — Maintenance/Fleet standing sweep (until CC-2 back at 18:00, then coordinate)
Continue Fleet/Maintenance defect sweep; post files-touched to OUTBOX so you don't collide with CC-2's
Maintenance audit on return. File real defects, ask lead before minting a REG number.

DONE line each row: `CODEX | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT REG-###`
