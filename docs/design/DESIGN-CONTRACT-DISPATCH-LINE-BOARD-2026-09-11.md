# Design contract — Dispatch › TRUCK LINE (v3, owner rulings 2026-09-11 16:30–16:55 Central)

Reference render (the source of truth, open it): `docs/design/reference/DISPATCH-LINE-BOARD-REFERENCE-2026-09-11.html`
(same file on the owner's Mac: `~/Downloads/09-11-2026-Claude-Lead-DISPATCH-LINE-BOARD-DESIGN.html`).

Owner, verbatim: "a new kanban format design page almost the same as it is here. but it will be instead of dragging the
truck box, it will be like a line map of a truck … when we double click on that rows box, for instance if we have a load
on T122, we input all data etc. we double click on dispatch, and it shows the line and that it is currently at
dispatched, we then click on at pick up etc." Follow-up: "we are missing in the design the status names on top."

The full contract (stations, what each click writes, rules, measured tokens, guard spec) is inside the render's
"Design contract" section. It is ADDITIVE: a 4th segment "Line Board" beside List | Kanban | Round Trips. Nothing removed.
Not assigned to a seat yet — owner approval of the render first, then Cursor (Dispatch surface owner) builds it.

## v3 rulings (16:45–16:55 Central)
- Name: **Truck Line** (5th segment beside Kanban · List · Round Trips · Trip Pairing). Alternates offered: Status Line, Progress Board.
- New station **Other** after In transit: an exception with a reason from one catalog (`catalogs.load_exception_reasons`), the reason list VISIBLE in the pop-up, printed under the node; never changes `loads.status`; appends to a new `dispatch.load_exceptions`.
- Colors: owner first asked for livelier colors, then ruled "nevermind, remove these colors. in the line maybe green, red if any issues" — app palette unchanged; the line alone is green (reached) / red (issue: Other, late, no ping).
