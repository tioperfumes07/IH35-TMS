# GAP-47 — Dispatch Authorization Gates

Central gate registry enforcing WF-044 (PM advisory), WF-050 (DVIR major block), WF-038 (active driver block).

`GET /api/dispatch/auth-gates/check?action=book_load&...`

AuthGatePanel embedded in BookLoad + AssignmentEdit; dispatch mutation routes guarded via preHandler hook.
