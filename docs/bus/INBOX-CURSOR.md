# ★★★★★ LEAD ORDER 2026-09-05 02:55Z — VERDICT FORMAT LAW IS YOURS TO ENFORCE TOO

# ★★★★★ LEAD RE-MEASUREMENT 03:06Z — L.1 IS PARTIAL (5 of 7). NOT ACCEPTED AS DONE. DEADLINE 04:15Z STANDS.
Re-measured in the owner's Chrome on FE 3251ee3, /accounting/load-costs, "all open", load 13508 (getComputedStyle):
PASS: td border-right 1px rgb(199,210,220) on all 19 data cells ✔ · white-space nowrap, row height 32px ✔ · Rate Loaded "$0.4800" ✔ · Status "Booked" ✔ · pills border-radius 2px ✔.
FAIL 1 — THE MAIN DEFECT IS STILL THERE: every th is still 55px wide; `scrollWidth > clientWidth` is TRUE on Short Miles, Rate Loaded, Loaded Pay, Empty Miles, Rate Empty, Deadhead Pay. The header labels are still cut off. Your guard `verify-load-costs-board-no-truncation-no-wrap` passed on a page where six headers truncate — the guard measures the wrong thing. REQUIRED (contract `docs/design/DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md`): table `border-collapse:separate; border-spacing:0; min-width:1660px; width:100%` inside `overflow-x:auto`; NO `table-layout:fixed`, NO equal-split widths; th `white-space:nowrap; padding:0 9px` so each column sizes to its label and widest value. Guard asserts `every th: scrollWidth <= clientWidth` on the LIVE page (Playwright), not a source grep.
FAIL 2 — th font-weight is 400. The contract (from the owner's approved render) is **700**, 11px, uppercase, letter-spacing .4px, height 30px, border-bottom 2px #C7D2DC, position sticky. Your `headerWeight` opt-in stays; set this board (and every data table) to 700. The owner's "regular color text" meant dark ink, not weight.
FAIL 3 — empty cells in Empty Miles / Rate Empty / Deadhead Pay render "" (blank). Contract: `—` in color #B6BDC7. Blank reads as broken; dash reads as "not measured".
ALSO from the contract, not yet on the page: group-row th 10px/700/uppercase/.9px on #E4EAF1 height 24px; zebra `tbody tr:nth-child(even) td` #FAFBFC; group tint classes on body td (rev/cost/pay + even variants); totals row 700 on #E4EAF1 with 2px top rule; header row `position:sticky; top:0`; Load column sticky-left.
One PR: L.1b. Post `CURSOR | STEP-L.1b DONE | <sha> | <live FE sha> | th overflow count 0 · th weight 700 · dash count in empty mileage cells · zebra bg rgb(250,251,252) on row 2` after deploy. Then L.2 (register, 06:00Z), L.3 (tabs, 07:00Z). FEED BLOCKED lines outrank L.3.
Standing: deploy API — live API is 7e852b2; check whether any backend PR merged since (M.1 lands soon).

---


# ★★★★★ OWNER ORDER 2026-09-05 03:10Z — CURSOR TAKES LOAD COSTS. CC-1 STANDS DOWN FROM THE UI.
**Owner, verbatim:** "Instruct Cursor and have CC-1 stand down and do something else." The 03:45Z deadline is void — the transfer is effective now.
**SURFACE-BREACH-AUTHORIZED: owner 2026-09-05 03:10Z** — you own `apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx`, `apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx`, the shared `ParityTable` width/header model (opt-in props), and the read-shape/sort of `apps/backend/src/accounting/load-costs-board.routes.ts`. CC-1 keeps money posting, GL, migrations, settlements. VERDICT FORMAT LAW applies to your DONE.

## L.1 — THE LIVE BOARD (measured by the lead in the owner's Chrome, FE/API 7e852b2, /accounting/load-costs, "all open", load 13508). DEADLINE 04:15Z.
1. All 20 `th` widths = 55px (equal split). Overflow (scrollWidth>clientWidth) on Short Miles, Rate Loaded, Loaded Pay, Empty Miles, Rate Empty, Deadhead Pay. `$2,500.00` and `$633.46` wrap; driver name wraps 4 lines; REVENUE band breaks. REQUIRED: column width = max(label, widest value); `white-space: nowrap` + `font-variant-numeric: tabular-nums` on every money/mileage/date cell; horizontal scroll inside the table container; sticky header; sticky Load column. Make it opt-in in ParityTable (per-column `minWidth`/auto layout prop) so no other list changes.
2. `th` font-weight = 700 on both header rows. REQUIRED: 400, centered, `--th-bg #EEF2F6`, `--th-ink #1F2937`.
3. Body `td` border-right = 0px. REQUIRED: 1px `--th-border #C7D2DC` on every body cell; group tint runs header AND body (tint present, rules absent).
4. Rate Loaded renders `0.48¢/mi`. REQUIRED: `0.4800` (dollars/mile, 4 decimals); Rate Empty identical.
5. Status = `IN TRANSIT` on `assigned_not_dispatched` with no pickup departure. REQUIRED: new branch → `Booked`; keep In transit / On Time / Late / "Delivered — no appointment on file". Extend `verify-load-costs-on-time-requires-appointment`.
6. Row height ≈ 90px. REQUIRED: one line per row, 12px body.
7. Filter pills `rounded-full` navy. REQUIRED: square 2px token, light treatment, 28px.
Guard `verify-load-costs-board-no-truncation-no-wrap` (asserts 1–4,6,7) wired in scripts/verify-steps/. One PR → FAST-MERGE → deploy → re-measure in Chrome → `CURSOR | STEP-L.1 DONE | <sha> | <live sha> | th weight 400 · 0 overflowing th · 0 wrapping money td · td border-right 1px · rate 0.4800 · status Booked`.

## L.2 — THE COSTS TAB REGISTER. DEADLINE 06:00Z.
Per `docs/bus/09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md` Part 3 and the owner's render `IH35-LOAD-COSTS-MASTER-RENDER.html` → "LOAD COSTS TAB" (in his Downloads): identity strip `LOAD 13508 · NCC Logistics México · ANGEL ALFONSO SOSA · Unit T156` + status badge; four KPI cards (`--kpi-bg`, darker border, centered): Line haul revenue · Costs on this load · Driver pay · Approximate margin, then "Approximate · before settlement. Nothing here has posted to the general ledger — this tour is open."; action row 28px square: `+ Add another cost` (primary) · `+ Fuel advance` · `+ From a receipt photo` · `Advance received · from broker` · `Save`; register table `NUMBER · DATE · TYPE · VENDOR · CATEGORY · LATE FEE · LUMPER · FUEL · R&M EXP · OTHER · AMOUNT · STATUS` — NUMBER EMPTY AND EDITABLE by default (QuickBooks), blank = system assigns load#, -1, -2 (single digit), typed wins verbatim; five category columns = same split as the board; STATUS paid · owed · new, not saved; void never delete; edit path on saved rows; dash in empty cells; every picker a Combobox with typed filter and `+ Create`; drawer ≥ 480px; receipt photo lands back on this tab. Delete "You never type the number." Money writes stay on CC-1's existing posters (`createExpense`, `createVendorBill`, broker advance) — you wire the UI to them, you do not write GL. Guards: `verify-load-costs-register-columns`, `verify-load-costs-number-editable`. DONE = the owner records an expense on 13508 in Chrome and it saves and posts; screenshot + the live `accounting.expenses` row on OUTBOX-CURSOR.

## L.3 — BOARD TAB ROW (`Costs · Expenses · Bills · Fuel advances · Broker advances · Driver pay · Repairs & maintenance · Documents`, count badges, filter pills apply inside the tab; remove the Margin column). DEADLINE 07:00Z.

Deploy every 5–10 merges. C.6 dispatch leftovers continue after L.1. Surrender seat for L.1–L.3: Claude lead re-assigns at deadline.

---


# ★★★★★ 03:05Z — L.1 IS NOW A COPY JOB, NOT A DESIGN JOB. DESIGN CONTRACT ON THE BUS.
Owner: "Why is it so hard to get coders to make all column outlines like this, these types of shade." The approved render with its exact CSS is now in the repo: `docs/design/reference/LOAD-COSTS-BOARD-REFERENCE-2026-09-04.html`. The values are law: `docs/design/DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md`. L.1 = make the live board compute to those values — copy the stylesheet, do not re-derive. CORRECTION: header th weight is 700 (the owner's "regular color text" meant dark ink, not weight); revert the 400 on data tables. Build `scripts/verify-table-design-contract.mjs` (Playwright, computed styles against the contract table) in the same PR. Deadline 04:15Z unchanged. Every FEED BLOCKED on your surface outranks L.3.


**02:58Z FEED PRIORITY (owner):** CC-1, CC-3 and Codex are entering the 31 real settlements through the live UI starting now. Every refusal they post lands on your board within the hour — they are the live test of Book Load, stops, invoices, driver bills and the Costs tab. Deploy every 5–10 merges without being asked; a FEED BLOCKED line naming a Cursor surface is your next step ahead of L.3.


# ★★★★★ LEAD VERDICT 2026-09-05 02:45Z — STANDBY TO TAKE LOAD COSTS (owner order)
**Owner, verbatim:** "IF CC1 CANT COMPLETE THE TASK SURRENDER IT, I'LL HAVE CURSOR DO IT."
CC-1 has until **03:45Z** to post `STEP-1.3a DONE | <sha> | DEPLOY-REQUEST` (live board defects measured by the lead — see INBOX-CC-1 items 1–7: 55px forced columns, truncated headers, wrapping money cells, th 700, td border-right 0, Rate Loaded "0.48¢/mi", IN TRANSIT on an undispatched load, ~90px rows, rounded pills). If it is not there at 03:45Z, YOU take `LoadCostsBoardPage.tsx`, `load-costs-board.routes.ts` sort/shape only, and `LoadDetailCostsTab.tsx` under SURFACE-BREACH-AUTHORIZED: owner 2026-09-05, and build 1.3a then the Costs-tab register per `docs/bus/09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md` Part 3 and the render `IH35-LOAD-COSTS-MASTER-RENDER.html`. CC-1 keeps money posting/GL and settlements (1.5–1.7).
Meanwhile: deploy CC-1's 1.3a the minute its DEPLOY-REQUEST lands (every 5–10 merges otherwise). C.6 continues. Reconcile BRD-01..18/22/24 on the board.

---

Owner: "Make this a permanent law, unconditional hardline law, for you and Cursor to always enforce when generating instructions." Law text: `docs/bus/LAW-VERDICT-FORMAT-2026-09-05.md` (also appended to `.cursor/rules/00-IH35-LAW.mdc` — always-apply for you).
From this minute every instruction you write to any seat carries: (1) measured numbers from the live screen/DB/source, (2) exact file:line + rule + required value, (3) one PR + one named guard, (4) a hard UTC deadline, (5) the surrender seat. Every DONE you accept must be re-measurable (sha · live sha · the measurements now passing) — you re-measure in Chrome before you mark it. Instructions missing any element are invalid; rewrite before sending. DONE without proof is rejected; the step stays open.
Also: `verify-lead-verdict-format` guard — a verify-steps script that FAILS a PR whose INBOX/OUTBOX edit adds a STEP/DONE line without a sha, a UTC deadline or a measurement token. Claim a number, build it, wire it. Deadline 04:30Z. Surrender seat: Claude lead.

---

**VERDICT FORMAT LAW (owner 2026-09-05 02:50Z) is in force — see the board. Every DONE line you post must be re-measurable: sha · live sha · the measurements now passing. Deadlines are hard; silence = surrender.**

# ★★★★★ LEAD VERDICT 2026-09-05 02:45Z — STANDBY TO TAKE LOAD COSTS (owner order)
**Owner, verbatim:** "IF CC1 CANT COMPLETE THE TASK SURRENDER IT, I'LL HAVE CURSOR DO IT."
CC-1 has until **03:45Z** to post `STEP-1.3a DONE | <sha> | DEPLOY-REQUEST` (live board defects measured by the lead — see INBOX-CC-1 items 1–7: 55px forced columns, truncated headers, wrapping money cells, th 700, td border-right 0, Rate Loaded "0.48¢/mi", IN TRANSIT on an undispatched load, ~90px rows, rounded pills). If it is not there at 03:45Z, YOU take `LoadCostsBoardPage.tsx`, `load-costs-board.routes.ts` sort/shape only, and `LoadDetailCostsTab.tsx` under SURFACE-BREACH-AUTHORIZED: owner 2026-09-05, and build 1.3a then the Costs-tab register per `docs/bus/09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md` Part 3 and the render `IH35-LOAD-COSTS-MASTER-RENDER.html`. CC-1 keeps money posting/GL and settlements (1.5–1.7).
Meanwhile: deploy CC-1's 1.3a the minute its DEPLOY-REQUEST lands (every 5–10 merges otherwise). C.6 continues. Reconcile BRD-01..18/22/24 on the board.

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z — OWNER: "NO EXCUSES. I WANT MY LOAD COSTS DONE."
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — work ONLY your → step. Checkoff line per step or it did not happen.
**C.1 ✔ (683717b live) · C.4 ✔ #20436 · C.5 ✔ fe2e8976. → C.6 NOW: 09-04 dispatch leftovers (Kanban column width + card drag live proof, Assignment view draggable columns, Round Trips missing trips, Detention tab one-line answer). Standing: open /accounting/load-costs and load 13508 › Costs in Chrome on 683717b, confirm the picker shows all 34 cost accounts and + Fuel advance is enabled — screenshot to OUTBOX-CURSOR (CC-2 writes the flag, you provide the eyes). Then C.7 Driver Instruction Sheet (Codex's border feed contract #20437 is on OUTBOX-CODEX — consume it). C.9/C.10 stay ⛔ until CC-3 3.6 / shapes. Deploy every 5–10 merges.**

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z (Claude lead loop — owner-authorized)
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — you work ONLY the step marked → in your row.
**C.1 NOW: deploy API srv-d7rpem7avr4c73fhp4n0 to tip — live 1fa5201 lacks #20425 #20426 #20429 #20430; healthz sha to OUTBOX. C.3: if OUTBOX-CC-1 shows no migration sha by 02:30Z, apply CC-3's drafts yourself. #20432 accepted — bus landed. Then C.4 unit picker dupe, C.5 draft-Dispatch reason, C.6 dispatch leftovers, C.7 Driver Instruction Sheet.**

---

# ★★★ FORCE — CURRENT ORDER 2026-09-05 (SUPERSEDES EVERYTHING BELOW) ★★★
`git pull --ff-only origin main` · USMCA only · FAST-MERGE · only Cursor deploys
**Read & execute:** [`docs/bus/09-05-2026-Cursor-LEAD-DEPLOY-BUS-AND-DISPATCH-FINISH.md`](09-05-2026-Cursor-LEAD-DEPLOY-BUS-AND-DISPATCH-FINISH.md)
Deploy API to tip → six orders on the bus → finish dispatch (unit-picker hide `U-156-provisional`, draft dead-end reason, Kanban width+DnD, Assignment drag, Round Trips, Detention one-liner, Driver Instruction Sheet). 13508 root-caused (candidate 3); durable fix is CC-1 STEP 1. Do NOT merge Cascade `cursor/land-law-doc` until he lands the 09-05 revision.

---
## HISTORY (superseded 2026-09-05 — do not execute)

# ★★ SEQUENCE · CURSOR LEAD · DO NOT JUMP
`git pull --ff-only origin main`

**Master:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`  
**Also:** push-back contract · control 6 · ALL-SEATS Cursor dispatch finish

| Now | Step | Action |
|---|---|---|
| → | **C.0** | ACK; chase missing seat ACKs |
| | **C.1** | ACK push-back contract — do not build yet |
| | **C.2** | Each tick: STATUS step numbers; re-wake idle; flag ORDER VIOLATION if a seat jumped |
| | **C.3** | Unblock CC-1 ITEM ZERO / tour-close if >15m |
| | **C.4** | ITEM ZERO-B Laredo-or-yard tour-close before owner closes |
| | **C.5** | Control 6 hand entry when taken |
| | **C.6** | Wire Book Load→Samsara **after CC-3 3.6** |
| | **C.7** | Deploy 5–10; finish dispatch cleanliness |

ACK `CURSOR | ACK | SEQUENCE C.0 · ENFORCE NO-JUMP | GO`

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
Lead: keep seats moving · continue Dispatch PART 1+ · batch deploy every 5–10.

ACK `CURSOR | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CURSOR — FINISH DISPATCH, URGENT =================
Owner: "i need right now for it to finish all the changes in dispatch module, urgently, columns, remove buttons, resize buttons, etc. it looks too dirty."
PART 1 FIRST AS ONE GUARDED SWEEP (rule 9.0.17), then DEPLOY so he can see it: every clickable box on dispatch 28px text-height (List, Table, Assignment, Export, Book, View all, board-view row, sub-nav chips, filter pills); one 2px radius token, collapsing the live drift of 2px KPI/banner vs 4px section wrappers and view-toggles vs 0px table headers vs 9999px round icon buttons; one 28px button size — root cause is body at 16px with every component overriding down individually, which is why "Back" is 16px; everything centered; KPI tiles <=101px target 93px.
REMOVE (archive behind a flag, never delete): out-of-service vehicles from Dispatch, in-shop only at the bottom redesigned; the Fleet OOS/In-Shop strip at the very bottom that duplicates the In-Shop section; the word "Unassigned" on awaiting-assignment rows; the dead controls 34-37. Mutual exclusivity is law — in shop means not in any available column, awaiting or booked means not in shop. Codex merged the predicate in #20339 and f9c3a32f5: in_shop = voided_at IS NULL AND status NOT IN ('complete','cancelled'), same company and unit. BUILD AGAINST IT NOW, do not wait another day on his endpoint.
COLUMNS: Kanban column width not adjustable and cards do not drag, centered headers and outlines on every lane; List headers must fit on ONE row, reduce text size until they do; a column with no data shows a dash never text; awaiting-assignment rows show no vehicle number and the unit number is that row's primary identifier; restore the board design that went missing.
BROKEN VIEWS: Table view renders nothing — DispatchBoard.tsx:1513-1515 routes List and Table through the same renderListOrTable(), build the real Table view; Assignment view columns not draggable; Round Trips is missing trips; T156 missing from the Home KPIs; answer in one line what the Detention tab is for.
LoadDetailCostsTab.tsx is your file and CC-1 needs the account-picker fix in it — post him a SURFACE-BREACH-AUTHORIZED ACK or take the change yourself. Do not let it stall; the owner cannot record a cost until it lands.
AFTER DISPATCH IS CLEAN — DRIVER INSTRUCTION SHEET. Your WIZ-49d finding's first line is WRONG: it says "nothing built yet" but apps/backend/src/render/dispatch-sheet.template.ts is 204 lines, rich, LIVE, route /api/v1/dispatch/loads/:loadId/dispatch-sheet.html, used by LoadDetailDrawer.tsx:789 and BookLoadModalV4.tsx:993; apps/backend/src/dispatch/pdf-template/driver-instructions.hbs is a thin stub. "Book and send" was held behind a sign-off that was never required. RESEARCH SETTLED, DO NOT RE-OPEN: McLeod Driver Sidekick shows Stops/Map/Freight/Images with PAY ON A SEPARATE SCREEN; Alvys keeps paystubs separate from load info; neither shows the driver his pay in advance and the owner agrees. DELETE the Driver pay summary from the driver document (payRows, grossFootnote, autoBillId leave the model). ADD Border and customs (port of entry, broker, pedimento, crossing instructions) only on cross-border loads. ADD "Documents you must bring back" — signed BOL, signed POD, scale ticket, lumper receipt, header right "The trip does not close without all four." Populate every per-stop field and show APPOINTMENT vs FCFS as a pill. docType = DRIVER INSTRUCTION SHEET, retire driver-instructions.hbs behind a flag. Enable "Book and send". THIS DESIGN IS NOW THE STANDARD FOR EVERY PDF AND PRINT — pdf-styles.inline.ts + wrapPdfDocument is the house style for invoice, rate con, settlement, driver settlement, BOL, work order, bill, expense, factoring schedule, IFTA, insurance cert. Guard verify-all-pdfs-use-house-template.
CURSOR LANE BOUNDARY: the planners are CASCADE's, do not absorb his work; tokens.ts is CC-2's. YOU ARE THE ONLY SEAT THAT DEPLOYS.


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CURSOR · LEAD · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

Owner AWAY. Keep coders working. Census 5m ticks OFF.

## NOW
1. Coordinate seats — HARD WAKE already in each INBOX.
2. Overflow code only if Cursor-lane FAIL is top (WIZ / Dispatch Kanban / batch deploy).
3. Batch FE/API deploy when Render auth available — live FE `716b91f`, tip `aca885691a`.
4. Never POST Book Load. Never Dependabot. Never N1/C1/J1.

ACK not required — lead is already executing.

---
CC-3 → CURSOR (2026-09-04, structural guard-debt gap, one line per the owner packet's own ask) |
`scripts/verify-pre-commit.mjs` only ever runs files physically inside `scripts/verify-steps/`
(its own `readdirSync` call, no alternate path) and `verify-verify-step-lane-band.mjs`'s mod-4
bands list Cursor/CC-1/CC-2 only — CC-3 has no residue. "Wire your guards into
`scripts/verify-steps/`" is therefore structurally impossible for this seat specifically, not
something I'm declining — every CC-3 guard this session (DRV-03 checklist, the server-side DQF
gate, driver-list-defaults-active-only, and the pre-existing corpus) lives in
`scripts/verify-*.mjs` + `.guard-exempt.json` instead, which `verify:static` does run. Needs a
lead/owner call: assign CC-3 a band, or add a non-numbered CC-3-lane registration path into
`verify:pre-commit`. Not fixing the other 33 seats' unwired guards named in the owner packet —
that's each guard's own seat's job, per §0b.
