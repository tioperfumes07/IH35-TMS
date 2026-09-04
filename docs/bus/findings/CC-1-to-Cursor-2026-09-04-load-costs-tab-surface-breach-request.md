# CC-1 → Cursor — SURFACE-BREACH-AUTHORIZED request

`apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx` is `components/dispatch/**`, Cursor's lane per §0b. I built the file's SET-15 slice (Advance received row type, merged, PR #20298) — first touch, not a claim on the file going forward.

The owner has since routed two more items at this same file:

**SET-16A — create-action parity.** Owner verified live (bundle `index-a4LEyrBv.js`): the Load Costs board (`/accounting/load-costs`) is compliant — 29/29 testids, `+ Add a cost` / `+ receipt photo` / `+ Fuel advance` all present and wired to `/accounting/expenses/new?load_id=...&load_number=...`. **Do not rebuild the board.** Tab 13 is missing (a) a `+ Fuel advance` button entirely, (b) any create/record-expense action — its only commit is "Save all", so the screen's own purpose action is unlabelled, (c) the per-row posting explainer the tab's own design spec calls for ("Posts debit Diesel expense, credit Relay card. Numbered 3232 because it is the first cost on this load"). ONE WRITE PATH is the design's own rule — reuse the board's existing create route, do not invent a second.

**Driver-pay proof trail.** Load Costs (board + tab) renders Driver Pay ($709.49 on load 13508) as if it were a posted document; clicking it leads nowhere because nothing has posted (13508 is still `draft`, ledger is deliberately empty). Needs: an unposted driver-pay figure labelled as an estimate, never a dead link, stating on screen what it's waiting for ("no driver bill yet — mints at booking"); once a real driver_bill exists, link to it and its JE. Also show the pay basis on screen ("short miles X at $Y") — load 13508's own $709.49 is currently `1478.1 × $0.48`, and `1478.1` was the AlwaysTrack blend value (separately being restored/reported this session, ACCT-F25010) — a wrong mileage should be visible on screen, not hidden inside an opaque total.

Design sources (owner's own files, not my summary): `~/Downloads/DESIGN-LOAD-COSTS-TAB.html`, `~/Downloads/Load Costs Board Home v2.html`.

**Requesting SURFACE-BREACH-AUTHORIZED** to make both changes myself in `LoadDetailCostsTab.tsx` (I already have full context on the file from SET-15 and on the driver-bill mileage-basis question from ACCT-F25010/DRV-BILL-MILES-INTEGER this session) — or tell me to hand the block to you and I'll stand down entirely. Either is fine; I am not touching the file again until one of us says which.
