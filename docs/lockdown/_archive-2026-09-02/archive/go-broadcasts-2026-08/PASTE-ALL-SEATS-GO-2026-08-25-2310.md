# GO-2310 — 23:10 CT — LIVE MODULE WALK · CALENDARS + SAME CREATE CHROME · IDLE = DEFECT

Owner: seats were hunting numbered leftover lists while **live chrome classes** were not walked. Do not idle. Do not wait for the next paste. **CC-1 still finishes money #3** (`57cabbab` JE) first, then walks accounting calendars/nested create. Nobody `trigger_deploy`. Skip #15546. U14 never restamp. FAST-MERGE ~4 min. Never `gh pr checks --watch`.

CURRENT-LAW unchanged: USMCA only · CREATE-TEST-THEN-VOID · unique FINDING = 500 / dead click / silent no-op / calendar seize / nested create that is **not** the Lists/module creator.

## WHAT TO CLICK (every assigned module, every tab, every +Create / picker)

1. **Calendar / DatePicker** — open it. Click a day. Prev/next month. Click outside.
   - FAIL if it **seizes** (frozen, cannot pick).
   - FAIL if it **closes then immediately re-opens** on the same click (click-through onto the trigger).
   - FAIL if opening it **auto-closes** before a day is chosen.
   - FAIL if a wrapping `<label>` steals the click.
2. **Every popup / modal / ParityDrawer / combobox** — fields that belong there are present; Save is honest; Cancel/X close; nested drawer stacks above the parent (not behind).
3. **Same create chrome** — `+ Add new` / `+ Create` from **Lists**, **that module**, and **inside any other modal** must open the **same** creator:
   - vendor → `VendorCreateModal`
   - customer → `NewCustomerDrawerForm` / `CustomerProfileForm` (not a skinny “Quick Create Customer”)
   - driver → `CreateDriverModal`
   - expense → `RecordExpenseModal`
   - bill → the accounting bill create drawer used from `/accounting/bills`
   File unique FINDING if a second thin form exists.

Grep before coding: `DatePicker.tsx` `suppressToggleRef` · `QuickCreateEntityModal` `NewCustomerDrawerForm`.

ACK: `SEAT | ACK | GO-2310 | PORT=n | NOW=<module> | SHA=<healthz> | GO`

| Seat | NOW walk (then next numbered GO-2237 leftover) |
|------|--------------------------------------------------|
| CC-1 9223 | Money #3 JE `57cabbab` first. Then `/accounting` DatePickers + nested vendor/customer/expense/bill create. |
| CC-2 9224 | `/cash-flow` `/reports` `/finance` `/tasks` calendars + popups. |
| CC-3 9225 | `/lists` `/legal` nested `+ Add new` = Lists creator. |
| Codex 9226 | `hop.assign` UI then `/drivers` `/fleet` `/safety` `/fuel` calendars + CreateDriver/Unit/Trailer. |
| Cascade | Live walk starting `/accounting` then owner seq customers→drivers→vendors→dispatch. FINDING only. |
| Devin-A | Live walk `/customers` then `/dispatch` calendars + Book Load nested creates. FINDING only. |
| Cursor | Ship shared DatePicker click-through + QuickCreate customer = Lists chrome. Overflow remaining icon-only Back. Lead FAST-MERGE. |

OUTBOX one-liner same turn. Board row if unique. Do not remake #15916 #16002 #16026.
