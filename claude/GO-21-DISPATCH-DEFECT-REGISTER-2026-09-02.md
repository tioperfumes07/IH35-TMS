# GO-21 — DISPATCH DEFECT REGISTER · 2026-09-02

Owner ran Book Load live. ~40 defects + 2 structural blockers. **GO-21 supersedes the GO-20 tail** until these rows have a seat, a PR, and Chrome click.

**Cursor = lead only.** Seats never POST Book Load. Only the owner books. USMCA has one load: `L-20260901-0001` (cancelled).

## VERIFIED FACTS (do not re-derive, do not contradict)

- No table matching `%interchange%` exists. The concept is absent.
- `mdata.loads` has `load_trailer_equipment_id` (equipment-**type** catalog) and `trailer_type` (text). Neither identifies a physical trailer.
- `BookLoadModalV4` `assigned_trailer_unit_id` reads `mdata.units` — **owned fleet only**.
- `BookLoadCustomerSection.tsx` caps 500 (no search) / 200 (search) vs ~2,700 customers. Comments `CLS-SILENT-CAP` / `LST-PICKER-01`.
- `BookLoadValidationSection.tsx`: left `text-xs`, right `text-[10.5px]` / `text-[10px]` / `text-[9px]`. Four sizes, one panel.
- `BookLoadModalV4.tsx:799` prints only the field-group label on a blocked save.
- Never insert a broker trailer into `mdata.units`.

## DISPATCH ORDER (NOW)

| # | Seat | Row | Notes |
|---|------|-----|--------|
| 1 | **CC-3** | **A2** customer picker | Blocks data entry. One file. Ship first, own PR. |
| 2 | **CC-1** | **A1** interchange migration | Money lane HH 00–11 UTC. Claim then author. Not `mdata.units`. |
| 3 | **CC-2** | **J1** design system | Not idle. Tokens + shared components + guard. Verify-live B standing. |
| 4 | **CC-3** | **A1 FE** | After CC-1 migration on main. Watch INBOX-CC-3. |
| 5 | **Codex** | Save-block message + rate-con upload | Then GO-20 D/H leftover if any. |

**CC-1 after A1:** B5 (pay rate from driver profile) + B8 (cash/fuel advance wired, pending deduction). Then GO-20 tail: **A screen** → **20** settlement 5753 → DRIVER-F7334 remainder.

**CC-3 after A2:** wizard B1 B2 B3 B4 B7 B9, then A1 UI, then boards E–I adopting CC-2 tokens.

**DONE** = every GO-21 row has a seat, a PR, and the owner can click it in Chrome.

## LANE

Cursor: coordinate, FAST-MERGE, deploy 5–10. **Do not implement GO-21 rows.** No GUARD-WORKORDERS dispatch. No Downloads queues. No SWEEP-A.
