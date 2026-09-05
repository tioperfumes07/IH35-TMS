**VERDICT FORMAT LAW (owner 2026-09-05 02:50Z) is in force — see the board. Every DONE line you post must be re-measurable: sha · live sha · the measurements now passing. Deadlines are hard; silence = surrender.**

# ★★★★★ OWNER ORDER 2026-09-05 02:58Z — THE SETTLEMENT FEED IS PRIORITY #1 FOR EVERY MONEY-CAPABLE SEAT. START NOW. NO GATE.
**Owner, verbatim:** "Which coder is seeding the company and driver settlements to create the loads and expenses for most of the loads? I would think this is priority for other coders."
The "after Cursor L.2" gate is removed. Every record type the feed needs has a live write path today (Book Load wizard, stops, proforma invoice at pickup, driver bills, the Costs tab with all 34 cost accounts and + Fuel advance — deployed in 7e852b2). Cursor's register is cosmetics on top; it does not block entry.
Spec: `docs/bus/09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md` STEP 6 · `docs/bus/09-04-2026-Claude-Coder-1-FEED-THE-APP-REAL-SETTLEMENT-DATA.md` (in the owner's Downloads and `docs/bus/`) · packets in `docs/bus/settlement-entry-2026-09-04/` · source PDFs `Company_Settlement_57xx.pdf` + `Driver_Settlement_57xx.pdf` in the owner's Downloads.
**THE SPLIT (31 settlements, 66 loads):**
| Seat | Settlements | Count |
|---|---|---|
| CC-1 | 5753, 5760, 5761, 5762, 5763, 5764, 5765, 5767, 5768, 5769, 5770, 5771 | 12 |
| CC-3 | 5773, 5774, 5775, 5777, 5778, 5779, 5781, 5782 | 8 |
| CODEX | 5785, 5786, 5787, 5788, 5789, 5790, 5791, 5792, 5793, 5794, 5795 | 11 |
| OWNER (hands off) | 5766, 5772, 5776, 5780, 5783, 5784 | 6 |
**RULES — verbatim law, no interpretation:** through the REAL UI write path (Chrome on app.ih35dispatch.com, the owner's session or your seat's login) — no SQL, no seed script, no bulk INSERT. `is_sample_data=false` — these are REAL records. Masters: MATCH existing customers/drivers/units/trailers/vendors, never create a duplicate (Simple/Simplex/Silo stay three). Loads with stops: ADDRESSES ONLY — never type a mileage; the engine routes. Customer invoice = line haul at the settlement's rate. EVERY diesel purchase its own expense row with the vendor's invoice number, paired DEF line on the same invoice; every scale/washout/toll/tire/lumper its own row on its load and vendor. Driver bill two lines (loaded + deadhead) at the settlement's rates; flat-rate loads — if the override path does not exist, STOP and post it. Additional pay, reimbursements, deductions one row each tied to the load; escrow $25.00 per load only where the document shows it. Pre-settlement per tour — LEAVE OPEN, NEVER CLOSE. Never invent a payment, date, address or amount; 5789/13557 invoice 99462408 printed 2026-09-29 → enter 2026-08-29 with a memo (the only authorized correction). STOP AT THE FIRST REFUSAL and post `SEAT | FEED 57xx BLOCKED | <exact screen + error text> | owning seat` — a refusal is worth more than the row; do not hand-INSERT past it.
**REPORT** one line per settlement: `SEAT | FEED 57xx DONE | loads <n> · stops <n> · invoice $ · diesel rows <n> $ · other rows <n> $ · driver bill $ · pre-settlement <id> OPEN | foot vs printed: match/diff`. Then your slice total against the packet.
**DEADLINES:** first settlement of your slice DONE or BLOCKED by 04:00Z; slice complete by 10:00Z. Surrender: the lead re-splits a stalled slice to the other two seats.
**ORDER OF WORK PER SEAT:** CC-1: M.1 migration #4 first (03:40Z — it is five minutes and unblocks the geofence engine), then FEED, then M.2. CC-3: FEED first, then M.3 backend. CODEX: X.6 paste (20 min), then FEED, then X.9.

---


# ★★★★★ LEAD VERDICT 2026-09-05 02:45Z — OWNER: "GET CODEX WORKING."
X.3 X.4 X.5 ✔. You have been silent since #20437.
→ **X.6 NOW (30 min, no code):** on API 61f1967 call and PASTE the raw JSON to OUTBOX-CODEX: `GET /api/v1/maintenance/in-shop-units?operating_company_id=5c854333-6ea5-4faa-af31-67cb272fef80` (expect 200 with [] and a named empty state, never 404); `GET units-without-load` (15 rows, every unit_number non-blank); `GET /api/v1/border-crossing/loads/926f4142-3fe4-4aa5-b896-daa0ca6474c4/driver-instructions` (13508 has no border stop → honest empty, not an error).
→ **X.7 (code, one guarded PR):** design law on YOUR surface — every maintenance list/table header centered on --th-bg, regular weight, 1px --th-border between columns in header AND body, no truncated labels, KPI tiles --kpi-bg + darker border, zebra, sticky header, dash never zero/None, 28px controls; getComputedStyle proof per surface.
→ **X.8:** Work Order create/edit — every picker a Combobox with typed filter and + Create; unit picker excludes Sold/deactivated/non-entity units (same rule as Cursor #20436); repair ≥ $7,000 routes to role fixed_asset_default (1500) and SAYS SO on screen — code + guard only, live proof waits for a real repair.
Checkoff line per step. Never idle. Never deploy — DEPLOY-REQUEST to OUTBOX-CURSOR.

---


# ★★★★★ LEAD VERDICT 2026-09-05 02:45Z — OWNER: "GET CODEX WORKING."
X.3 X.4 X.5 ✔. You have been silent since #20437.
→ **X.6 NOW (30 min, no code):** on API 61f1967 call and PASTE the raw JSON to OUTBOX-CODEX: `GET /api/v1/maintenance/in-shop-units?operating_company_id=5c854333-6ea5-4faa-af31-67cb272fef80` (expect 200 with [] and a named empty state, never 404); `GET units-without-load` (15 rows, every unit_number non-blank); `GET /api/v1/border-crossing/loads/926f4142-3fe4-4aa5-b896-daa0ca6474c4/driver-instructions` (13508 has no border stop → honest empty, not an error).
→ **X.7 (code, one guarded PR):** design law on YOUR surface — every maintenance list/table header centered on --th-bg, regular weight, 1px --th-border between columns in header AND body, no truncated labels, KPI tiles --kpi-bg + darker border, zebra, sticky header, dash never zero/None, 28px controls; getComputedStyle proof per surface.
→ **X.8:** Work Order create/edit — every picker a Combobox with typed filter and + Create; unit picker excludes Sold/deactivated/non-entity units (same rule as Cursor #20436); repair ≥ $7,000 routes to role fixed_asset_default (1500) and SAYS SO on screen — code + guard only, live proof waits for a real repair.
Checkoff line per step. Never idle. Never deploy — DEPLOY-REQUEST to OUTBOX-CURSOR.

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z — OWNER: "NO EXCUSES. I WANT MY LOAD COSTS DONE."
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — work ONLY your → step. Checkoff line per step or it did not happen.
**X.3 ✔ X.4 ✔ X.5 ✔ (#20437 contract accepted). → X.6 NOW: live-verify on API 683717b — GET /api/v1/maintenance/in-shop-units (0 rows expected, 200 not 404, empty state named), units-without-load 15 rows all with unit_number, border driver-instructions on 13508 (no border stop → honest empty, not error); paste the three responses to OUTBOX-CODEX. → X.7: design law on YOUR surface — every maintenance list/table header centered on --th-bg, KPI tiles --kpi-bg + darker border, zebra, sticky header, dash never zero/None, 28px controls, one guarded PR with getComputedStyle proof. FLT-10 rendering is Cascade's — hand-off line only.**

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z (Claude lead loop — owner-authorized)
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — you work ONLY the step marked → in your row.
**X.1 DONE accepted (0 units held). X.2 #20430 accepted — shape matches. Post STEP-X.2 DONE + DEPLOY-REQUEST 9851699d to OUTBOX-CURSOR. NOW X.3: unit_number on every units-without-load row. Then X.4 FLT-01→02→04→10, X.5 border contract.**

---

# ★★★ FORCE — CURRENT ORDER 2026-09-05 (SUPERSEDES EVERYTHING BELOW) ★★★
`git pull --ff-only origin main` · USMCA only · FAST-MERGE · no money path · you never deploy
**Read & execute:** [`docs/bus/09-05-2026-Codex-IN-SHOP-FEED-FLEET-QUEUE-BORDER-CONTRACT.md`](09-05-2026-Codex-IN-SHOP-FEED-FLEET-QUEUE-BORDER-CONTRACT.md)
Hand Cursor the In-Shop-only feed (one predicate, no OOS) → awaiting-assignment carries the unit number → fleet queue FLT-01/02/04/10 as complete verticals with guards wired → border contract to Cursor for the Driver Instruction Sheet.

---
## HISTORY (superseded 2026-09-05 — do not execute)

# ★★ SEQUENCE · CODEX · DO NOT JUMP
`git pull --ff-only origin main`

**Master:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`  
**Law:** ALL-SEATS Codex section

| Now | Step | Action |
|---|---|---|
| → | **X.0** | ACK |
| | **X.1** | Report open-maintenance unit count (ask before close) |
| | **X.2** | In-shop feed for Cursor |
| | **X.3** | Awaiting-assignment unit number |
| | **X.4** | FLT-01 → FLT-02 → FLT-04 → FLT-10 |
| | **X.5** | Border contract to Cursor |

Not yours: settlement feed, geofence import, deploy.

ACK `CODEX | ACK | SEQUENCE X.0 · NO JUMP | GO`

---
# ORCHESTRATOR FAST-MERGE WAKE · 2026-09-04 18:32 CT
`git pull --ff-only origin main`

## FAST-MERGE 4-MINUTE LAW (ON — permanent weekend method)
Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. Gate: `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file …`) → **exit 0 = merge proof**
2. Push → open **ready** PR (never draft) → **same 15s** squash:
   `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
3. NEVER `gh pr checks --watch` · NEVER ask Jorge to merge · NEVER idle after merge
4. `--no-verify` push ONLY after gate PASS and ONLY for ENV-VERIFY-STATIC class
5. One vertical at a time · FINISH before next · Never POST Book Load
6. Deploy is batched 5–10 merges — **Cursor/CC-1 only** — do not per-merge deploy

Tip `526e392d74`. FE+API deploy kicked to tip (batch of 4 undeployed). Pull. ACK. CODE NOW.

## SEAT NOTE
In-Shop feed + #10 · FAST-MERGE · post DEPLOY-REQUEST only — do not trigger_deploy.

ACK `CODEX | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

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
