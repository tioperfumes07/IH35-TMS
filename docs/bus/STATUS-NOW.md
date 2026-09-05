# STATUS-NOW · 2026-09-05 (Cursor lead)
Tip `df8fcd2b`. API deploying to tip (was live `aeade65`; order's `1fa5201` was stale). Open PRs: 0. FAST-MERGE 4min ON.
Six 09-05 orders placed on the bus (this PR). SEQUENCE strict in force. USMCA only · no Jorge pings · never POST Book Load as probe.

| Seat | Current step | State |
|---|---|---|
| CURSOR | C.7 deploy done → C.2 six orders on bus (this PR) → dispatch finish (unit-picker dupe hide, draft dead-end, Kanban, Round Trips, Detention, Driver Instruction Sheet) | working |
| CC-1 | Load Costs vertical: STEP 2 done (#20425/#20426 CoGS+fuel/bank by role); on STEP 1 crew-not-draft guard (`cc-1/load-crew-not-draft-guard-claim`, #20428 reserved 10377) | working |
| CC-2 | ACC-13 landed (#20422/#20424); design-system token sweep + ACC-01..20 | working |
| CC-3 | Samsara geofence import steps 1–2 merged (#20411/#20418); redirected off Samsara-access hold → PART 3 accident-liabilities void FE + geofence state-machine/alert-chain + hand migrations to CC-1 | re-tasked |
| CODEX | In-Shop feed + fleet queue FLT-01/02/04/10 + border contract | working |
| CASCADE | land 09-05 law-doc revision on `cursor/land-law-doc`, then 3 planners, then lists/reports | re-tasked |

13508: root-caused (candidate 3 — crewed 09-02 before WIZ-STATUS-01; edit-triggered fix; `draft→dispatched` is a 400 silent no-op). Hand-advanced to `assigned_not_dispatched` 01:24Z; durable wiring fix + guard is CC-1 STEP 1.
Escrow (document truth, 36 driver settlements + company 5784): **$25.00 per load, conditional (12/36 none), cap $2,500 unchanged** — pinned into CC-1 STEP 5.
