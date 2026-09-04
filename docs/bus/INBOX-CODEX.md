# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CODEX — FLEET, MAINTENANCE, BORDER =================
This is a WORK ORDER, not reference. Anything with your seat name in the filename is an instruction.
1. UNBLOCK THE OWNER FIRST, BEFORE ANY CODE. He wrote "REMOVE ALL VEHICLES FROM MAINTENANCE AT THE MOMENT, SO IT IS NOT A BLOCKER. OR VERIFY IT WAS DONE." Query production under bypass, USMCA only: which units are held by an open work order under your own contract (voided_at IS NULL AND status NOT IN ('complete','cancelled'))? REPORT THE COUNT AND THE UNIT NUMBERS IN ONE LINE. Do not close a work order without his word — report, then ask in one line. A bare 0 under forced RLS is MASKED, not empty.
2. HAND CURSOR THE IN-SHOP FEED. He has been blocked on you all day. One endpoint, one predicate, IN-SHOP ONLY NO OOS. Post the shape to OUTBOX-CODEX.md the minute it merges.
3. AWAITING-ASSIGNMENT ROWS SHOW NO VEHICLE NUMBER. Fix the contract so it carries the unit number; Cursor renders it.
4. #39 — your catch that the guard was unregistered was the real defect and e6fd87179 closed it. #38 — DispatchList.tsx (@archived, 476 lines) has no live imports, only dispatchListTypes.ts is imported by DispatchBoard.tsx: REPORT IT, DO NOT DELETE IT. One line in your outbox. Closed. The pattern you found is bigger than your lane — 34 root-level guards have no numbered verify-step; wire yours, file the rest as one line.
5. FLEET QUEUE IN ORDER: FLT-01, FLT-02, FLT-04 vehicle swap catalog, FLT-10. FLT-04 matters more than its number: a truck can break down mid-trip and dispatch swaps vehicles — still ONE trip, ONE settlement, TWO trucks. THE UNIT LIVES ON THE LEG, NOT ON THE TOUR. Settlement 5784 shows T171 running three loads with three different trailers (10380, 10222, 10870) inside one settlement. The real constraint is that no unit may hold two loads with overlapping active windows, enforced on loads — not a unit lock on the tour. Maintenance rules already ruled: capitalize at $7,000 or above (supersedes the $2,500 in the older standards skill), under that expense; Suarez-type = vendor bill, roadside cash = expense; EVERY repair requires a Work Order; inventory parts at $50+; fines split DOT/Regulatory vs Internal Driver. The >=$7,000 capitalization live proof STAYS DEFERRED until a real repair exists — you were right to refuse to invent a production record, do not revisit it.
6. BORDER: BOR-01 is merged. The border data belongs on the Driver Instruction Sheet Cursor is building — port of entry with CBP port code, customs broker and contact, pedimento/entry number, crossing instructions. GIVE HIM THE CONTRACT, one endpoint, same shape as the In-Shop feed. loadHasCrossBorder() at LoadDetailDrawer.tsx:107 is canonical — DO NOT WRITE A SECOND ONE.
YOU NEVER DEPLOY. When the connector lost its workspace you were right not to guess across accounts — now do not attempt it at all. Post DEPLOY-REQUEST: <sha> - <why> to OUTBOX-CODEX.md and keep building. A worktree missing typescript is an environment fault, not a gate failure — link the repo dependency tree, never bypass the gate.


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CODEX · HARD WAKE · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

FAST-MERGE. Never POST. Jorge AWAY. Census ticks OFF.

## NOW
1. Keep **#9 In-Shop contract** one-liner current in OUTBOX (endpoint + fields + predicate). Cursor consumes it for FE #8.
2. **#10** mutual-exclusivity data half — unit with open WO must not appear available/awaiting.
3. If API SHA lags your merge: post `DEPLOY-REQUEST: <sha>` to OUTBOX — Cursor batches deploy. You do not trigger_deploy.
4. Owner A3/B12 repro request stays owner-only (Save draft, never Book). Do not POST.

ACK `CODEX | ACK | In-Shop contract + #10 · NEVER POST | GO`
