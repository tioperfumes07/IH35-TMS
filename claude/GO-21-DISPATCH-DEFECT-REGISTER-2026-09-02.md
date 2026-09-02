# GO-21 — DISPATCH DEFECT REGISTER · 2026-09-02 · **49 rows**

Owner Book Load live + two follow-up messages. **GO-21 + GO-22 supersede the GO-20 tail** until every row has a seat, a PR, and Chrome click.

**Cursor = lead only.** Seats **never POST Book Load.** Only the owner books. USMCA has one load: `L-20260901-0001` (cancelled).

**Devin-A = RETIRED.** Live-verify moved to **CC-2**. Status does **not** move on merge. CC-2 re-walks the screen; then Cursor records PR# on the row. Owner’s live tracker may update in parallel — **do not hold K-rows waiting for first PRs.** Add them now; leave Status=OPEN until Chrome.

Companion: `claude/GO-22-PRESETTLEMENT-REGISTER-2026-09-02.md`

## VERIFIED FACTS (do not re-derive, do not contradict)

- No table matching `%interchange%` existed at owner audit. **A1 data+API shipped** `dispatch.non_owned_trailers` + `dispatch.trailer_interchanges` PR **#19567** (`11d3c12`). Chrome still OPEN until A1 FE + owner click. Never put broker trailers in `mdata.units`.
- `mdata.loads.load_trailer_equipment_id` is equipment-**type** catalog; `trailer_type` is text. Neither is a physical trailer.
- `BookLoadModalV4` `assigned_trailer_unit_id` reads owned `mdata.units` only.
- Customer picker caps 500 / 200 vs ~2,700 (`CLS-SILENT-CAP`, `LST-PICKER-01`).
- `BookLoadValidationSection.tsx`: left `text-xs`, right `text-[10.5px]` / `text-[10px]` / `text-[9px]`.
- `BookLoadModalV4.tsx:799` prints only the field-group label on a blocked save.
- **Four comboboxes.** Only `components/Combobox.tsx` dismisses on outside click. `parity/EntityPicker.tsx`, `shared/SelectCombobox.tsx`, `shared/Combobox.tsx` do not. Book Load imports EntityPicker + SelectCombobox. Not a regression of the file that was fixed.
- `book-load.service.ts` ~2264: `TODO P6-FOLLOWUP-PRESETTLEMENT-LINK` logs `dispatch.load.presettlement_link_deferred`. See GO-22.
- `driver_finance.driver_settlements` is empty all entities. `lib.trace_counters` has no settlement doc type. Load allocator queries `LOAD`; rows use `LD`. Do not invent a third.

## DISPATCH ORDER (NOW)

| # | Seat | Row | Notes |
|---|------|-----|--------|
| 1 | **CC-3** | **A2** | Customer picker. Blocks data entry. One file. First PR. |
| 2 | **CC-2** | **J1 + K2** | Transcribe locked scale to **zero this week**. Claim ≡3 verify-step **first**. Do not design tokens. |
| 3 | **CC-1** | **B5** then **B8** | A1 data+API already **#19567**. Do not remake A1 SQL. |
| 4 | **CC-3** | **K1 K3 K4 K5** then B1–B4 B7 B9 | After A2. Then **A1 FE** (XOR our unit / interchange). |
| 5 | **CC-1** | **GO-22** | Pre-settlement query + number + recommend (trip_link_queue shape) + manual. |
| 6 | **Codex** | **B12** then **B6** | Save-block names which stop/why. Rate-con upload. |

Then GO-20 tail: CC-1 **A screen** → **20** settlement 5753 → DRIVER-F7334 remainder.

**J1 children (do not one-off patch):** C1–C3, D1–D5, E2, E3, F2, F4, H3, I1. CC-2 tokens close them together. CC-3 adopts after tokens land.

**DONE** = every row has a seat, a PR, and the owner can click it in Chrome.

## LANE

Cursor: coordinate, FAST-MERGE, deploy 5–10. **Do not implement GO-21/GO-22 rows.** No GUARD-WORKORDERS dispatch. No Downloads queues. No SWEEP-A. Closing already-fixed GUARD rows is cleanup (OK).

---

## BOARD (49) — Status OPEN unless Chrome-proven

Claim = owner wording. Seat = only implementer.

### A — Blockers

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **A1** | Trailer interchange does not exist. Load 13508 used the broker's trailer; there's no option, no table, no record. | CC-1 data+API **#19567**. CC-3 FE | #19567 data | OPEN Chrome |
| **A2** | Customer box doesn't filter — capped at 500/200 against ~2,700 customers. | **CC-3** | | OPEN |
| **A3** | 13508 not saved: "Not saved — these fields blocked it: Stops." Nothing in USMCA. | Codex B12 + CC-2 verify | | OPEN repro |

### B — Book load wizard

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **B1** | "Always track load number" box unnecessary — that's the number typed at the top. | CC-3 | | OPEN |
| **B2** | Historical inactive driver UUID shown raw to an operator. | CC-3 | | OPEN |
| **B3** | Historical import reason: no catalog, no dropdown filter, no +; on the left, belongs on the right. | CC-3 | | OPEN |
| **B4** | Equipment load type sitting under Customer invoice charges — nothing to do there. | CC-3 | | OPEN |
| **B5** | Driver pay rate typed here; must come automatically from the driver profile. | **CC-1** | | OPEN |
| **B6** | Rate con upload didn't work (section A or E). | **Codex** | | OPEN |
| **B7** | Sample load demo box unnecessary. | CC-3 | | OPEN |
| **B8** | Cash advance / fuel advance not fully wired: Comchek/EFTPS/wire number, full linkage, receipt upload. | **CC-1** | | OPEN |
| **B9** | Pickup/delivery State is not a filter-combo dropdown. | CC-3 (after K2 component) | | OPEN |
| **B10** | Section D boxes too big — should be smaller, 2 or 3 per row. | CC-2 (J1) | | OPEN |
| **B11** | Section D left-hand and right-hand text are different sizes. | CC-2 (J1) | | OPEN |
| **B12** | Save-block message names "Stops" but never says which stop or why. | **Codex** | | OPEN |

### C — QuickBooks money/number format (J1)

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **C1** | Accessorial amount · 17. | CC-2 | | OPEN |
| **C2** | Weight box · 18. | CC-2 | | OPEN |
| **C3** | Expected adjustments. | CC-2 | | OPEN |

### D — Box sizing (J1)

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **D1** | Customer WO vs always-track boxes · 20. | CC-2 | | OPEN |
| **D2** | Cash advance / fuel advance / factoring boxes · 21. | CC-2 | | OPEN |
| **D3** | Assignment mode row vs team preset · 22. | CC-2 | | OPEN |
| **D4** | Load number at top exaggerated, "looks like a kids toy" · 23. | CC-2 | | OPEN |
| **D5** | Trip pairing trailer-types vs unit/driver box. | CC-2 | | OPEN |

### E — Dispatch home

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **E1** | Settlements and factoring duplicated — two tab rows, same info. | CC-3 | | OPEN |
| **E2** | KPI boxes not in the unit column format specified. | CC-2 J1 child | | OPEN |
| **E3** | All white — KPI boxes, columns and rows need to be more pronounced. | CC-2 J1 child | | OPEN |

### F — Load boards

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **F1** | Kanban units not draggable for manual move. | CC-3 | | OPEN |
| **F2** | List missing the per-section column headers. | CC-2 J1 child | | OPEN |
| **F3** | Board view list and table are identical — not working. | CC-3 | | OPEN |
| **F4** | Assignment: same text size everywhere; column designs inconsistent. | CC-2 J1 child | | OPEN |

### G — Trip pairing

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **G1** | "All trailer types" box is grey, doesn't open, isn't a filter dropdown. | CC-3 | | OPEN |
| **G2** | Search unit renders no data. | CC-3 | | OPEN |
| **G3** | Unbooked/unavailable should be narrower/wider so units render in 1–2 columns. | CC-3 | | OPEN |
| **G4** | Must stay on ONE window — usually 2 loads, triangulations 1–2+ before the round trip south. Design already given. | CC-3 | | OPEN |

### H — Planners

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **H1** | Driver name doesn't render correctly. | CC-3 | | OPEN |
| **H2** | Missing the column with book / reserve / generate leave. | CC-3 | | OPEN |
| **H3** | Name not in its own column. | CC-2 J1 child | | OPEN |
| **H4** | "Available" should be in its own column. | CC-3 | | OPEN |
| **H5** | Book column needs to differentiate. | CC-3 | | OPEN |
| **H6** | Driver unit / out-of-service boxes rest on top of the calendar. | CC-3 | | OPEN |

### I — Load board (live)

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **I1** | Same column issues. · 42. | CC-2 J1 child | | OPEN |
| **I2** | Sort box should be a filter dropdown. · 43. | CC-3 | | OPEN |
| **I3** | Header with unit and August dates renders weird. | CC-3 | | OPEN |

### J — Root cause

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **J1** | No design system — text sizes, column headers, groupings all different across every dispatch page and likely every other module. Tokens = transcription of `docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md`. Closes at off-scale 0 + trapping pickers 0 this week, not when the ratchet is green. | **CC-2** | | OPEN |

### K — Section A (owner 2026-09-02 follow-up) · five rows · board = 49

| ID | Claim | Seat | PR | Status |
|----|-------|------|----|--------|
| **K1** | Code column should be the income item. | **CC-3** | | OPEN |
| **K2** | Dropdowns stuck open (click away does not close). Four comboboxes; one fix. | **CC-2** (J1 first hop) | | OPEN |
| **K3** | Search field inside Section A rows — unnecessary. | **CC-3** | | OPEN |
| **K4** | Per-stop pickup/delivery extra rates showing with no extra stop. Hide until extra stop/delivery added. | **CC-3** | | OPEN |
| **K5** | Per-page and "Page 1 of 1" under charges — unnecessary. | **CC-3** | | OPEN |
