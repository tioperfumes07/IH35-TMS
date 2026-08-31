# GO — UI CONSISTENCY, WHOLE APP

**IH35-TMS · USMCA · 2026-08-31 · owner-directed**  
**LAW:** `LAW-BLAST-RADIUS-NO-VERTICAL-FIXES-2026-08-31.md` — one defect, three costumes.

---

## PART 1 — Subnav / tab rows (Driver Settlements = standard)

| | Settlements (standard) | Dispatch (violation) |
|--|------------------------|----------------------|
| background | rgb(26,31,54) navy | rgb(255,255,255) white |
| height | 28px | 52px |
| wrapping | 0/11 | 13/13 |
| nav rows | 1 | 4 stacked |

**Rules:** shared navy strip · **nothing wraps** (scroll or More menu) · badges fixed-height · **two rows max** per module.  
**Guard:** `scripts/verify-subnav-standard.mjs`  
**Before fix:** audit table `module | background | height | items | wrapping | nav rows` for ALL modules.

---

## PART 2 — List rows = columns, not middot sentences

**Instance:** `SettlementsPage.tsx:402-430` — driver · load · bill in one flex cell.  
**Settlements columns (owner spec):** DATE · DRIVER · LOAD NUMBER · SETTLEMENT/BILL NUMBER · AMOUNT · STATUS — each sortable.  
**Same shape:** `PreSettlementsPanel.tsx` (lines ~43-84).

**Blast radius:** triage `·` hits to **repeated list rows only** — panel titles like `Open Driver Bills · 16 · $7,930` are FINE.

**Fix:** extract shared **DataTable** from existing `<thead>` convention (41 files already use it).  
**Priority:** settlements → pre-settlements → open driver bills → invoices → bills → loads → factoring.  
**Guard:** `scripts/verify-list-rows-use-datatable.mjs`

---

## PART 3 — Whole-app audit before any fix

Produce table: `module | tab | subnav OK? | DataTable? | wrapping? | nav rows | notes`  
Cover every sidebar module. **Table IS the blast radius** — no code until table is complete.

---

## Seat lanes

| Seat | Role |
|------|------|
| **Cascade / Devin-A** | Live Chrome screenshots + audit notes (subnav height/bg + list row shape) — report only until Cursor ships primitive |
| **Cursor** | Shared subnav component + DataTable primitive + guards + money/ops surfaces first |
| **CC-3** | Wire guards after claim |
