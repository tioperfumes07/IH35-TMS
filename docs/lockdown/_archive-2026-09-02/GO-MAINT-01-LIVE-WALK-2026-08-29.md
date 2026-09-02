# GO-MAINT-01 — Maintenance live walk (2026-08-29)

**THIS IS NOW with GO-WONUM-01 + GO-MATRIX-PROOF.** Walk file: owner Desktop `BLOCK-MAINT-01-live-walk-2026-08-29`. USMCA. No TEST created in that walk. KEEP TEST. Skip #15546. Nobody but Cursor `trigger_deploy`.

Do **not** “fix” Create Work Order validation, DOC-01 uploader, VMRS triad, Create Expense WO-FK gate, or CT dates. Copy those.

## P0 CC-1 now — false DOT O/O 14

Live `GET /api/v1/maintenance/dashboard/kpis`: `dot_oos: 14` = `total_units − active_units` (38−24). `out_of_service: 0` `severe_oos: 0`. Tile drills `/maintenance/severe-repairs` → “No severe alerts.”

`is_oos` must not mean “not InService.” FMCSA OOS ≠ retired/sold/in-shop/trailer.

1. One definition. Reconcile `dot_oos` / `out_of_service` / `severe_oos`.
2. Guard: KPI payload must not ship two different OOS numbers; drill row-count must match the tile.
3. Recipe B → CC-2 stamps. Claim ≡1 before any new verify-step.

## P1 CC-1 now — MTD Cost $0

`mtd_repair_cost: 0` with three completed August WOs on the same screen. Trace and fix or stop displaying it. Same guard family as P0.

## P2 Cursor — hex ratchet (claim EVEN first, then author)

Ban `(bg|text|border|ring|from|to|via|fill|stroke)-\[#` in `apps/frontend/src`. Seed semantic tokens (success/warning/danger/info). Keep VMRS triad via tokens — remap cyan COMPLAINT (`#0891b2` banned). WO create primary = navy like Expense. Rule 17. Do not delete the triad.

## P3 Codex + Cursor after P0

Duplicate OPEN WOS / PM DUE vs PM DUE SOON / dual totals / WO in both Recent lists. Owner consolidates two KPI strips only after P0 numbers are true.

## P4 Codex after P0

Generator writes raw accident UUIDs — fix at write, EntityLink human ref. Omit `GPS: ,` when coords null.

## P5–P6 Cursor (UI-01)

Title/tab clip, Add files wrap, loading vs `—`. Distinct loading chrome so `—` means empty only.

## WO format

**Stays** `WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5}` (Rule 03). See `GO-WONUM-01`.
