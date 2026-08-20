# SUPERSEDED · 2026-08-20

Do **not** run this folder. Current: `docs/bus/CODER-INSTRUCTIONS-NOW.md` + `INBOX-<SEAT>.md`. URGENT-14.

# OWNER LAW — CHROME + FULL SURFACE INVENTORY (2026-08-12) · CANONICAL

**Process law (owner):** Instructions to every coder **FIRST**. Then build. Never start a wave while seats have no paste.

**Supersedes:** `MATRIX-COMPLETE-INVENTORY-2026-08-12/` pastes alone (inventory still true; chrome bar added here).  
Older inventory-only pastes → `_SUPERSEDED-2026-08-12/`.

---

## A. Inventory / matrix (already in flight — Cursor)

Every tab · sub-tab · leaf · module · modal · side modal · drawer · panel · wizard · popup · ParityDrawer · create · **search bar · filter · gear · date range · every clickable/searchable control** must appear on the module matrix (Required leaf) or be EXEMPT with reason.

- Required leaves expanded (~864→~1057) + §B9 columns (`claim` `work_order` `accident` `policy` `settlement` `legal_matter` `invoice` `bank`)
- Guard: `verify-required-surface-inventory-complete` (3118)
- View: `/program/matrix`

**Still owed:** inventory of **toolbar controls** (search / range / gear / filter chips) as leaves or as `qbo_chrome` checklist cells — Cursor adds in follow-on if not already leaf-covered.

---

## B. Chrome design law (VERIFY-1 / `qbo_chrome`) — SYSTEM-WIDE · NO EXCEPTIONS

Owner live defects named 2026-08-12. Fix as **classes** (one helper + one ratcheting guard), not one page.

| # | Law | Fail example | Fix class |
|---|-----|--------------|-----------|
| 1 | **No box-in-box** | Assignment History From/To calendars nested borders, misaligned | Strip nested `border`/`rounded` wrappers; single field chrome |
| 2 | **QBO calendar only** | Native date / double-boxed pickers | Shared `DatePicker` only (already gated — extend to every remaining surface) |
| 3 | **QBO money format** | Wrong accounting number chrome on economics | Shared `MoneyInput` / QBO number format on every money field |
| 4 | **Combobox dismiss** | Open dropdown forces pick; click outside does **not** close | Combobox/Popover: outside-click + Esc closes **without** forcing a value |
| 5 | **Filter/gear → Apply** | Filters apply on every click / no Apply | Filter panel + gear: **Apply** (and Cancel/Reset) before query changes |
| 6 | **List toolbar triad** | Data pages missing search and/or range and/or gear | Every data pipeline list: **Search + date/amount range + gear** |
| 7 | **Proportional chrome** | Modals/side panels/text/boxes wrong scale | Shared density tokens; no one-off padding; modal/drawer proportions per approved screens |
| 8 | **Responsive** | Does not adapt to laptop / desktop / TV | Layout fluid; tables scroll inside; no clipped chrome at common widths |

Matrix column: **`qbo_chrome`** (Wave D) carries all of the above. Do **not** invent a “scenario-crossing” column.

---

## C. Sequence (unchanged)

P10 modules first → all modules. Wave A–C linkage/money continue. Wave D chrome uses this law. Built ≠ Live.

## D. Seat pastes (ONLY these)

| File | Seat |
|------|------|
| `PASTE-CC-1.md` | money number format + economics chrome |
| `PASTE-CC-2.md` | live verify chrome samples + reverse still |
| `PASTE-CODEX.md` | Combobox dismiss · filter Apply · list toolbar · box-in-box |
| `PASTE-CURSOR.md` | bus · matrix inventory finish · responsive · DatePicker sweep · Assignment History fix |

