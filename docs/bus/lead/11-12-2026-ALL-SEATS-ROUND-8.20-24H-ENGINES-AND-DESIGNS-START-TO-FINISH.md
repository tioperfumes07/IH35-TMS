# ROUND 8.20 — 24-hour plan: every engine and every board, start to finish (Lead, 11-12-2026 5:50 PM CT / 22:50Z)

Deadline 2026-11-13 22:45Z. Each seat's full box is below. The same boxes are prepended to each INBOX.

---

# CC-1 — ROUND 8.20 — 5 ENGINES, start to finish · deadline 2026-11-13 22:45Z
From Claude-Lead, 11-12-2026 5:50 PM CT (22:50Z). Supersedes 8.19's engine lines for CC-1. 8.19 non-engine rows stay yours, after these.

**Owner, verbatim (11-12-2026 4:42–4:44 PM CT):**
- "Create a plan for each coder, fully and totally building, wiring etc for the engines, total responsibility … It should not take more than 24 hours. It has been weeks."
- "We are not seeding data, we are creating and finishing the engines completely. Do not drift or deviate … all have been asked and answered and should not be blocked by anything. Follow fast merge law … start to finish, total and complete build … designs, wiring, routed, reverse, economic, money, financial, mechanical."

**Measured 22:43Z** on origin/main `2709c8a8`:
- Boards fully certified: **0 of 45.**
- Register: **169 of 314** rows are not DONE.
- Engines not DONE: **27.** Every one is assigned below to exactly one seat. Nothing is shared, and nothing waits on another seat.

**WHAT "ENGINE" MEANS (no exceptions).** An engine is NOT a data fix or a seed. It is code that does the job automatically, every time, at the write path. Existing records are then put through that same engine (a replay through the service), never through hand SQL.

**EVERY ENGINE IS BUILT START TO FINISH IN THIS ORDER, in ONE PR per engine:**
1. **ENGINE.** One service function, one writer. It runs on every new record at the event that creates or changes it (book, deliver, post, import, close).
2. **MONEY.**
   - Any GL effect posts ONLY through the existing posting engine (`accounting.journal_entries`): balanced, tied to its source document, entity-correct.
   - Never a raw money INSERT or UPDATE.
   - Never write the right-hand legacy tables (`payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`, `mdata.qbo_vendors`).
3. **WIRING.**
   - The record links both ways to its hubs (`mdata.loads`, `mdata.drivers`, `mdata.units`, `mdata.customers`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`, `maintenance.work_orders`).
   - The PR carries the linkage declaration.
4. **ROUTE / UI.**
   - Where the result shows in the app.
   - Every number drills to its source record.
   - Back returns with the filters kept.
5. **REVERSE.** The undo path (void or reversal JE, unlink, re-open) is built and tested. Nothing is deleted.
6. **EXISTING RECORDS.** Run the SAME engine over the records already in production (replay). Post the count before and after.
7. **GUARD.** A `scripts/verify-*.mjs` that FAILS before the fix (negative control) and passes after, wired into CI. No exemption entries.
8. **TEST.** A real-Postgres test of the engine and its reverse.
9. **LIVE PROOF.** Deployed sha (healthz `git_sha` + `/version.json`), plus the live query result and the live screen number, in your OUTBOX.

**ALL QUESTIONS ARE ANSWERED. Owner rulings that apply:**
- Build engines first, match later (11-02). Do not mass-apply fuel matches.
- Do not lock any period yet (11-02). Build the lock engine, do not lock.
- Transportation diesel on USMCA loads = loan to Transportation, 8000 Inter-company (10-24 2:36 PM).
- Every real truck is owned by IH 35 Trucking and leased to USMCA.

If something looks blocked, the blocker is yours to fix in the same PR. You do not wait.

**FAST MERGE LAW:**
- Run `npm run verify:pre-commit` plus the touched suites locally.
- Push, then merge within 4 minutes of a green `required-checks-gate`.
- Claim a migration number in its own PR first.
- A migration that needs production rows must `RAISE NOTICE … RETURN` on a fresh database (#29125).
- Never merge with locked-guards red.
- Main red is everyone's P0: fix it within 15 minutes.

**TIERED MODELS — no wasted tokens (owner 4:44 PM CT):**
- **Top tier** (Opus / strongest Codex / Cursor max) ONLY for designing an engine's money logic, a migration, or a guard, and for the final review of your own PR diff.
- **Mid tier** (Sonnet / standard) for writing the code from that design, tests, and UI wiring.
- **Small tier** (Haiku / mini subagents) for searches, log reading, CI-failure triage, register updates, OUTBOX lines.
- Never re-read a whole large file. Grep, then read the exact lines.
- Run only the touched test files and the touched guards locally, then `verify:pre-commit` once before push. Never run the full suite in a loop.
- One PR per engine or board. No exploratory branches, no restated plans, no essays in OUTBOX: one line per item (PR · sha · live number).
- When CI fails, read the failing step's last 30 lines only, fix, push.

**HARD DEADLINE 2026-11-13 22:45Z (4:45 PM CT Friday).** Checkpoints are 02:45Z · 06:45Z · 10:45Z · 14:45Z · 18:45Z · 22:45Z. At each one, post a DONE line per finished item in your OUTBOX: PR · sha · live number. Miss a checkpoint and the item moves to the seat named below.

USMCA only. No test or sample rows in production. No TRANSPORTATION or TRUCKING writes beyond the 8000 inter-company loan engine.

**1. ENG-04 — Driver Net-Pay Clearing (2170) engine.** Measured: 2170 Cr **$2,575.96 / 12 postings**; the writer never credits 2170.
- ENGINE: at settlement close the net pay is credited to 2170; at driver payment it is debited. One writer, through the posting engine.
- EXISTING RECORDS: replay the 12 postings through the engine (dry run was 3/12 reclass, $705.97). Each one clears against its document, or is listed with its cents per driver and settlement.
- WIRING / UI: JE ↔ settlement ↔ driver bill ↔ payment.
- REVERSE: settlement re-open reverses the credit.
- GUARD: 18809 shows 2170 = sum of open net pay.
- DUE **06:45Z**.

**2. ENG-44 — driver bill writer.**
- ENGINE: bill due date = load delivery date, stamped by the writer (13697 / 13690 / 13698).
- ENGINE: a salaried driver's stray per-load bill is voided by the engine.
- ENGINE: the pre-settlement autolinks its loads (13556 / 13563).
- ENGINE: `live_load_number` is never self-referential (13694 / 13695).
- EXISTING RECORDS: replay all live bills.
- UI: settlement ↔ bill ↔ load, both ways.
- REVERSE: un-void.
- GUARD: the four rules.
- DUE **06:45Z**.

**3. ENG-60 — lawsuits live only in Legal.** The FE cutover is done (17 guards pass).
- Finish: claim.lawsuit_id → legal matter on every path.
- Remove every reader and writer of `insurance.lawsuit`.
- Drop the table (it has 0 rows in every entity; dropping an empty table is authorized by this round).
- Legal › Lawsuits shows the matters; Insurance claim ↔ legal matter both ways.
- GUARD: no code references `insurance.lawsuit`.
- DUE **10:45Z**.

**4. ENG-34 — guard exemptions.** Measured: 16–28 exempt entries remain (920 historical).
- Wire every exempt guard into CI, or delete it with the reason in the PR. The exemption list ends at 0.
- GUARD: verify-guard-wired.mjs with ceiling 0.
- DUE **14:45Z**.

**5. ENG-22 — trailer type at booking.** Taken from Cursor so Cursor does designs only. Live 11-02: active mismatches 0; 3 cancelled loads (13593 / 13634 / 13635).
- ENGINE: booking refuses a trailer type that does not resolve in `catalogs.equipment_types`.
- Cancelled loads go through the same resolver.
- GUARD: 18930, ceiling 0, including cancelled loads.
- DUE **14:45Z**.

Then take the Lead's verify list (master plan § Lead) items 3 and 4.
Miss → the item moves to CC-3.

---

# CC-2 — ROUND 8.20 — 5 ENGINES, start to finish · deadline 2026-11-13 22:45Z
From Claude-Lead, 11-12-2026 5:50 PM CT (22:50Z). Rows 104–138 already moved to CC-3 (22:16Z). **Post an OUTBOX line at EVERY checkpoint, or the item moves.**

**Owner, verbatim (11-12-2026 4:42–4:44 PM CT):**
- "Create a plan for each coder, fully and totally building, wiring etc for the engines, total responsibility … It should not take more than 24 hours. It has been weeks."
- "We are not seeding data, we are creating and finishing the engines completely. Do not drift or deviate … all have been asked and answered and should not be blocked by anything. Follow fast merge law … start to finish, total and complete build … designs, wiring, routed, reverse, economic, money, financial, mechanical."

**Measured 22:43Z** on origin/main `2709c8a8`:
- Boards fully certified: **0 of 45.**
- Register: **169 of 314** rows are not DONE.
- Engines not DONE: **27.** Every one is assigned below to exactly one seat. Nothing is shared, and nothing waits on another seat.

**WHAT "ENGINE" MEANS (no exceptions).** An engine is NOT a data fix or a seed. It is code that does the job automatically, every time, at the write path. Existing records are then put through that same engine (a replay through the service), never through hand SQL.

**EVERY ENGINE IS BUILT START TO FINISH IN THIS ORDER, in ONE PR per engine:**
1. **ENGINE.** One service function, one writer. It runs on every new record at the event that creates or changes it (book, deliver, post, import, close).
2. **MONEY.**
   - Any GL effect posts ONLY through the existing posting engine (`accounting.journal_entries`): balanced, tied to its source document, entity-correct.
   - Never a raw money INSERT or UPDATE.
   - Never write the right-hand legacy tables (`payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`, `mdata.qbo_vendors`).
3. **WIRING.**
   - The record links both ways to its hubs (`mdata.loads`, `mdata.drivers`, `mdata.units`, `mdata.customers`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`, `maintenance.work_orders`).
   - The PR carries the linkage declaration.
4. **ROUTE / UI.**
   - Where the result shows in the app.
   - Every number drills to its source record.
   - Back returns with the filters kept.
5. **REVERSE.** The undo path (void or reversal JE, unlink, re-open) is built and tested. Nothing is deleted.
6. **EXISTING RECORDS.** Run the SAME engine over the records already in production (replay). Post the count before and after.
7. **GUARD.** A `scripts/verify-*.mjs` that FAILS before the fix (negative control) and passes after, wired into CI. No exemption entries.
8. **TEST.** A real-Postgres test of the engine and its reverse.
9. **LIVE PROOF.** Deployed sha (healthz `git_sha` + `/version.json`), plus the live query result and the live screen number, in your OUTBOX.

**ALL QUESTIONS ARE ANSWERED. Owner rulings that apply:**
- Build engines first, match later (11-02). Do not mass-apply fuel matches.
- Do not lock any period yet (11-02). Build the lock engine, do not lock.
- Transportation diesel on USMCA loads = loan to Transportation, 8000 Inter-company (10-24 2:36 PM).
- Every real truck is owned by IH 35 Trucking and leased to USMCA.

If something looks blocked, the blocker is yours to fix in the same PR. You do not wait.

**FAST MERGE LAW:**
- Run `npm run verify:pre-commit` plus the touched suites locally.
- Push, then merge within 4 minutes of a green `required-checks-gate`.
- Claim a migration number in its own PR first.
- A migration that needs production rows must `RAISE NOTICE … RETURN` on a fresh database (#29125).
- Never merge with locked-guards red.
- Main red is everyone's P0: fix it within 15 minutes.

**TIERED MODELS — no wasted tokens (owner 4:44 PM CT):**
- **Top tier** (Opus / strongest Codex / Cursor max) ONLY for designing an engine's money logic, a migration, or a guard, and for the final review of your own PR diff.
- **Mid tier** (Sonnet / standard) for writing the code from that design, tests, and UI wiring.
- **Small tier** (Haiku / mini subagents) for searches, log reading, CI-failure triage, register updates, OUTBOX lines.
- Never re-read a whole large file. Grep, then read the exact lines.
- Run only the touched test files and the touched guards locally, then `verify:pre-commit` once before push. Never run the full suite in a loop.
- One PR per engine or board. No exploratory branches, no restated plans, no essays in OUTBOX: one line per item (PR · sha · live number).
- When CI fails, read the failing step's last 30 lines only, fix, push.

**HARD DEADLINE 2026-11-13 22:45Z (4:45 PM CT Friday).** Checkpoints are 02:45Z · 06:45Z · 10:45Z · 14:45Z · 18:45Z · 22:45Z. At each one, post a DONE line per finished item in your OUTBOX: PR · sha · live number. Miss a checkpoint and the item moves to the seat named below.

USMCA only. No test or sample rows in production. No TRANSPORTATION or TRUCKING writes beyond the 8000 inter-company loan engine.

**1. ENG-50 — invoice paid-amount engine.** Live 11-09: invoice-amount-paid **174 > 102** ceiling; book-equals-Faro **12 issues** (13544, 6 load mismatches, 4 self-carry missing).
- ENGINE: `amount_paid` is never stored by hand. It is computed from applications (payments + Faro purchases) by one writer on every application or void (9-13515 $525, 7 $350).
- The Faro purchase links its load at import.
- EXISTING RECORDS: replay every USMCA invoice.
- UI: invoice ↔ applications ↔ bank line ↔ Faro purchase, both ways.
- REVERSE: void application → amount_paid recomputed.
- GUARD: invoice-amount-paid at 0; book-equals-Faro at 0.
- DUE **06:45Z**.

**2. ENG-17 — card/factoring payable residual engine.** Measured: 1090 **$170,210.48**, 2510 **$187,894.21**. Codex batch 1: 17/17 posted Faro documents tie, 14 unmatched.
- ENGINE: every 1090 / 2510 posting carries its source document, and the balance is the sum of open documents (one reader).
- UI: the account register lists each open document with a drill.
- EXISTING RECORDS: every posting is tied to its document by the engine. A posting with no document is listed with its amount.
- No balancing plug JE, ever.
- GUARD: residual = sum of open documents.
- DUE **10:45Z**.

**3. ENG-13 — trailer choice engine.** Measured 10-28: null = 1 (13595); settlement 5816 trailer 445 is missing from the fleet.
- ENGINE: booking requires a trailer (unit or type), and delivery cannot close without one.
- The trailer comes from documents through the same engine.
- Trailer 445 is created as fleet equipment through the equipment writer, with its document.
- UI: load ↔ trailer ↔ unit.
- GUARD: 0 live loads without a trailer.
- DUE **10:45Z**.

**4. ENG-48 — fuel fill → expense one-to-one engine.** Owner 11-02: build first, match later. Do NOT mass-apply.
- ENGINE: each fuel fill creates exactly one expense and one JE (13563-1 JE 0¢ is refused). Same-day duplicate fills are detected and held.
- No literal account '5000' in statement-card-credit-repair: resolve by role.
- UI: fill ↔ expense ↔ JE ↔ load ↔ unit.
- REVERSE: void the fill → void the expense and JE.
- GUARD: one-to-one ratchet.
- DUE **14:45Z**.

**5. ENG-49 — settlement line totals engine.** Live: 5787 → P-0018 closed; lines are layover 75 + reimbursement 22 + admin 10 (+ escrow 25). The claim of $235.01 vs $140.20 is not a live line total.
- ENGINE: the statement's non-diesel total = sum of its lines, computed by one reader. The document-side figure is shown next to it.
- UI: statement line ↔ expense ↔ document.
- GUARD: statement totals = line sums for every closed settlement.
- DUE **14:45Z**.

Miss → the item moves to CC-1.

---

# CC-3 — ROUND 8.20 — 6 ENGINES, start to finish · deadline 2026-11-13 22:45Z
From Claude-Lead, 11-12-2026 5:50 PM CT (22:50Z). The CC-2 overflow rows (104 105 106 107 108 110 112 113 115 124 138) stay yours, after these.

**Owner, verbatim (11-12-2026 4:42–4:44 PM CT):**
- "Create a plan for each coder, fully and totally building, wiring etc for the engines, total responsibility … It should not take more than 24 hours. It has been weeks."
- "We are not seeding data, we are creating and finishing the engines completely. Do not drift or deviate … all have been asked and answered and should not be blocked by anything. Follow fast merge law … start to finish, total and complete build … designs, wiring, routed, reverse, economic, money, financial, mechanical."

**Measured 22:43Z** on origin/main `2709c8a8`:
- Boards fully certified: **0 of 45.**
- Register: **169 of 314** rows are not DONE.
- Engines not DONE: **27.** Every one is assigned below to exactly one seat. Nothing is shared, and nothing waits on another seat.

**WHAT "ENGINE" MEANS (no exceptions).** An engine is NOT a data fix or a seed. It is code that does the job automatically, every time, at the write path. Existing records are then put through that same engine (a replay through the service), never through hand SQL.

**EVERY ENGINE IS BUILT START TO FINISH IN THIS ORDER, in ONE PR per engine:**
1. **ENGINE.** One service function, one writer. It runs on every new record at the event that creates or changes it (book, deliver, post, import, close).
2. **MONEY.**
   - Any GL effect posts ONLY through the existing posting engine (`accounting.journal_entries`): balanced, tied to its source document, entity-correct.
   - Never a raw money INSERT or UPDATE.
   - Never write the right-hand legacy tables (`payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`, `mdata.qbo_vendors`).
3. **WIRING.**
   - The record links both ways to its hubs (`mdata.loads`, `mdata.drivers`, `mdata.units`, `mdata.customers`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`, `maintenance.work_orders`).
   - The PR carries the linkage declaration.
4. **ROUTE / UI.**
   - Where the result shows in the app.
   - Every number drills to its source record.
   - Back returns with the filters kept.
5. **REVERSE.** The undo path (void or reversal JE, unlink, re-open) is built and tested. Nothing is deleted.
6. **EXISTING RECORDS.** Run the SAME engine over the records already in production (replay). Post the count before and after.
7. **GUARD.** A `scripts/verify-*.mjs` that FAILS before the fix (negative control) and passes after, wired into CI. No exemption entries.
8. **TEST.** A real-Postgres test of the engine and its reverse.
9. **LIVE PROOF.** Deployed sha (healthz `git_sha` + `/version.json`), plus the live query result and the live screen number, in your OUTBOX.

**ALL QUESTIONS ARE ANSWERED. Owner rulings that apply:**
- Build engines first, match later (11-02). Do not mass-apply fuel matches.
- Do not lock any period yet (11-02). Build the lock engine, do not lock.
- Transportation diesel on USMCA loads = loan to Transportation, 8000 Inter-company (10-24 2:36 PM).
- Every real truck is owned by IH 35 Trucking and leased to USMCA.

If something looks blocked, the blocker is yours to fix in the same PR. You do not wait.

**FAST MERGE LAW:**
- Run `npm run verify:pre-commit` plus the touched suites locally.
- Push, then merge within 4 minutes of a green `required-checks-gate`.
- Claim a migration number in its own PR first.
- A migration that needs production rows must `RAISE NOTICE … RETURN` on a fresh database (#29125).
- Never merge with locked-guards red.
- Main red is everyone's P0: fix it within 15 minutes.

**TIERED MODELS — no wasted tokens (owner 4:44 PM CT):**
- **Top tier** (Opus / strongest Codex / Cursor max) ONLY for designing an engine's money logic, a migration, or a guard, and for the final review of your own PR diff.
- **Mid tier** (Sonnet / standard) for writing the code from that design, tests, and UI wiring.
- **Small tier** (Haiku / mini subagents) for searches, log reading, CI-failure triage, register updates, OUTBOX lines.
- Never re-read a whole large file. Grep, then read the exact lines.
- Run only the touched test files and the touched guards locally, then `verify:pre-commit` once before push. Never run the full suite in a loop.
- One PR per engine or board. No exploratory branches, no restated plans, no essays in OUTBOX: one line per item (PR · sha · live number).
- When CI fails, read the failing step's last 30 lines only, fix, push.

**HARD DEADLINE 2026-11-13 22:45Z (4:45 PM CT Friday).** Checkpoints are 02:45Z · 06:45Z · 10:45Z · 14:45Z · 18:45Z · 22:45Z. At each one, post a DONE line per finished item in your OUTBOX: PR · sha · live number. Miss a checkpoint and the item moves to the seat named below.

USMCA only. No test or sample rows in production. No TRANSPORTATION or TRUCKING writes beyond the 8000 inter-company loan engine.

**1. ENG-25b — Transportation diesel on USMCA loads = inter-company loan.** Owner 10-24 2:36 PM.
- ENGINE: a fuel document paid by Transportation for a USMCA load posts as a loan to Transportation (8000 Inter-company – IH35 Transportation) via `rewriteDocumentLine` and the posting engine, at import and on edit.
- EXISTING RECORDS: replay the signed documents through it. AUTH-464 is the authorization.
- UI: fuel line ↔ inter-company JE ↔ load.
- REVERSE: rewrite back.
- GUARD: 0 Transportation fuel posted as a USMCA expense.
- DUE **06:45Z**.

**2. ENG-53 — load mileage and deadhead engine.** Live: 13690 deadhead stored NULL; the tip computes 1731.7; T174 odometer is 49.7 h stale; 13700 has no stop stamps.
- ENGINE: on booking and on every stop event, loaded / deadhead miles are persisted (with SAVEPOINT isolation) and the odometer is captured from telemetry.
- UI: load miles drill to stops and fences.
- GUARD: 0 live loads with NULL miles where the tip computes them.
- DUE **06:45Z**.

**3. ENG-29 — actual driven miles engine.** Live: 149 / 194 missing.
- ENGINE: `miles_driven_actual` is written from fence→fence events by the cron at delivery.
- EXISTING RECORDS: replay delivered loads through it.
- UI: load ↔ fence events.
- GUARD: missing count ratchet, with the reason per load (no fence data).
- DUE **10:45Z**.

**4. ENG-23 — customer at booking engine.**
- ENGINE: booking never falls back to the oldest customer; the customer comes only from the rate confirmation or the user.
- EXISTING RECORDS: audit every load booked under the old fallback against its document, and repoint through the load writer (invoice and JE follow through the engine).
- GUARD: no fallback code path; 0 mismatches.
- DUE **10:45Z**.

**5. ENG-27 — bank categorization ↔ load engine.** Live 10-28: **290** pre-10-17 postings without a load (ceiling 290).
- ENGINE: categorizing a bank line to a load-bearing account requires the load. The link comes from the document; never auto-match.
- EXISTING RECORDS: run the document link through the engine.
- UI: bank line ↔ load ↔ JE.
- GUARD: shrink to 0 unexplained.
- DUE **14:45Z**.

**6.** Then the 11 overflow rows, plus 8.19 rows 18 / 19 / 80.
Miss → the item moves to CC-1.

---

# LEAD — ROUND 8.20 — Lead's own, start to finish · deadline 2026-11-13 22:45Z
1. Prove live, or finish and then prove live: rows 235 (escrow visible), 236 (ENG-19 fuel counted once), 237 (AUTH ledger), 300 (ENG-55 drift alert), 303 (ENG-57 migrations), 311 (ENG-62 stop arrival from fence history).
2. ENG-36: 21 of 87 company settlements negative. Measure each one, correct it through the engine, or name the cause.
3. Bank match M1 / M2 / M3-M5, G1 / G9 / G11 / G12 / G15, cash-basis P&L F412, bank-line delete F431 (all MERGED-UNVERIFIED): prove live or fix.
4. Row 238 / ENG-21: the stop-address engine. A delivery stop needs street + geocode at booking; dispatch fills 13699 through the UI.
5. ENG-54: unit ownership engine. Owner entity + lease to USMCA on every unit. T122 / T124 / T156 are owned by IH 35 Trucking and leased to USMCA (rule given). The owner's truck list is entered through the unit UI.
6. ENG-38: period-lock engine (refuses writes into a locked period, shows it). Owner 11-02: do not lock any month yet.
7. ENG-58 scoreboard: REMOVED per the owner (5:42 PM ET).
8. Third-check every board marked CERTIFIED and keep the register honest.

**TIERED MODELS — no wasted tokens (owner 4:44 PM CT):**
- **Top tier** (Opus / strongest Codex / Cursor max) ONLY for designing an engine's money logic, a migration, or a guard, and for the final review of your own PR diff.
- **Mid tier** (Sonnet / standard) for writing the code from that design, tests, and UI wiring.
- **Small tier** (Haiku / mini subagents) for searches, log reading, CI-failure triage, register updates, OUTBOX lines.
- Never re-read a whole large file. Grep, then read the exact lines.
- Run only the touched test files and the touched guards locally, then `verify:pre-commit` once before push. Never run the full suite in a loop.
- One PR per engine or board. No exploratory branches, no restated plans, no essays in OUTBOX: one line per item (PR · sha · live number).
- When CI fails, read the failing step's last 30 lines only, fix, push.

---

# CURSOR — ROUND 8.20 — DESIGNS: BUILD boards 1–23 start to finish + CERTIFY Codex's 24–45 · deadline 2026-11-13 22:45Z
From Claude-Lead, 11-12-2026 5:50 PM CT (22:50Z). Engines are no longer yours (ENG-22 moved to CC-1). Designs only.

**Owner, verbatim (11-12-2026 4:42–4:44 PM CT):**
- "Create a plan for each coder, fully and totally building, wiring etc for the engines, total responsibility … It should not take more than 24 hours. It has been weeks."
- "We are not seeding data, we are creating and finishing the engines completely. Do not drift or deviate … all have been asked and answered and should not be blocked by anything. Follow fast merge law … start to finish, total and complete build … designs, wiring, routed, reverse, economic, money, financial, mechanical."

**Measured 22:43Z** on origin/main `2709c8a8`:
- Boards fully certified: **0 of 45.**
- Register: **169 of 314** rows are not DONE.
- Engines not DONE: **27.** Every one is assigned below to exactly one seat. Nothing is shared, and nothing waits on another seat.

**WHAT "ENGINE" MEANS (no exceptions).** An engine is NOT a data fix or a seed. It is code that does the job automatically, every time, at the write path. Existing records are then put through that same engine (a replay through the service), never through hand SQL.

**EVERY ENGINE IS BUILT START TO FINISH IN THIS ORDER, in ONE PR per engine:**
1. **ENGINE.** One service function, one writer. It runs on every new record at the event that creates or changes it (book, deliver, post, import, close).
2. **MONEY.**
   - Any GL effect posts ONLY through the existing posting engine (`accounting.journal_entries`): balanced, tied to its source document, entity-correct.
   - Never a raw money INSERT or UPDATE.
   - Never write the right-hand legacy tables (`payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`, `mdata.qbo_vendors`).
3. **WIRING.**
   - The record links both ways to its hubs (`mdata.loads`, `mdata.drivers`, `mdata.units`, `mdata.customers`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`, `maintenance.work_orders`).
   - The PR carries the linkage declaration.
4. **ROUTE / UI.**
   - Where the result shows in the app.
   - Every number drills to its source record.
   - Back returns with the filters kept.
5. **REVERSE.** The undo path (void or reversal JE, unlink, re-open) is built and tested. Nothing is deleted.
6. **EXISTING RECORDS.** Run the SAME engine over the records already in production (replay). Post the count before and after.
7. **GUARD.** A `scripts/verify-*.mjs` that FAILS before the fix (negative control) and passes after, wired into CI. No exemption entries.
8. **TEST.** A real-Postgres test of the engine and its reverse.
9. **LIVE PROOF.** Deployed sha (healthz `git_sha` + `/version.json`), plus the live query result and the live screen number, in your OUTBOX.

**ALL QUESTIONS ARE ANSWERED. Owner rulings that apply:**
- Build engines first, match later (11-02). Do not mass-apply fuel matches.
- Do not lock any period yet (11-02). Build the lock engine, do not lock.
- Transportation diesel on USMCA loads = loan to Transportation, 8000 Inter-company (10-24 2:36 PM).
- Every real truck is owned by IH 35 Trucking and leased to USMCA.

If something looks blocked, the blocker is yours to fix in the same PR. You do not wait.

**FAST MERGE LAW:**
- Run `npm run verify:pre-commit` plus the touched suites locally.
- Push, then merge within 4 minutes of a green `required-checks-gate`.
- Claim a migration number in its own PR first.
- A migration that needs production rows must `RAISE NOTICE … RETURN` on a fresh database (#29125).
- Never merge with locked-guards red.
- Main red is everyone's P0: fix it within 15 minutes.

**TIERED MODELS — no wasted tokens (owner 4:44 PM CT):**
- **Top tier** (Opus / strongest Codex / Cursor max) ONLY for designing an engine's money logic, a migration, or a guard, and for the final review of your own PR diff.
- **Mid tier** (Sonnet / standard) for writing the code from that design, tests, and UI wiring.
- **Small tier** (Haiku / mini subagents) for searches, log reading, CI-failure triage, register updates, OUTBOX lines.
- Never re-read a whole large file. Grep, then read the exact lines.
- Run only the touched test files and the touched guards locally, then `verify:pre-commit` once before push. Never run the full suite in a loop.
- One PR per engine or board. No exploratory branches, no restated plans, no essays in OUTBOX: one line per item (PR · sha · live number).
- When CI fails, read the failing step's last 30 lines only, fix, push.

**HARD DEADLINE 2026-11-13 22:45Z (4:45 PM CT Friday).** Checkpoints are 02:45Z · 06:45Z · 10:45Z · 14:45Z · 18:45Z · 22:45Z. At each one, post a DONE line per finished item in your OUTBOX: PR · sha · live number. Miss a checkpoint and the item moves to the seat named below.

USMCA only. No test or sample rows in production. No TRANSPORTATION or TRUCKING writes beyond the 8000 inter-company loan engine.

**YOU BUILD, one board per PR. Overhaul: the approved v3 design REPLACES the page, and the legacy component is deleted in the same PR:**
1 Accounting · 2 Accounting–Unexpected · 3 Banking · 4 Cash Flow Home · 5 Projected · 6 Actual vs Projected · 7 Rolling Ledger · 8 Manual · 9 Customers · 10 Vendors · 11 Driver Profile · 12 Dispatch–Truck Planner · 13 Load History · 14 Book Load Modal · 15 Side Panel · 16 Specification · 17 Trip Type · 18 Factoring · 19 Fuel · 20 Insurance · 21 Legal · 22 Maintenance–Home · 23 Maintenance–In Shop.
Your fix list = that board's "Missing, failing" column in `docs/design/BOARD-45-STATUS-2026-11-12.md`. Every listed defect is closed in the board's PR.

**EACH BOARD, START TO FINISH:**
1. **DESIGN.** Element census = the approved design at 1440×900: same sections, order, proportions and type scale. No legacy layer under or around it.
2. **ROUTED.** Its own canonical route, breadcrumb and tab state in the URL. Deep links reload to the same state.
3. **WIRED.** Every entity name is a link to its record (load, driver, unit, customer, vendor, invoice, bill, settlement, JE, document). That record links back.
4. **REVERSE.** Back from any drill returns to this board with the filters, period, tab and selection kept. No dead ends.
5. **MONEY.** Every amount is a MoneyCell that drills to its source document and JE. Totals = sum of rows. KPI = the same reader as the table. Accrual / cash basis respected.
6. **FILTERS.** Every filter is multi-select where it filters entities. Every combination returns the right rows; View all restores.
7. **STATES.** Empty / loading / error / keyboard / every action button works, or is absent.

Then mark it **READY** in `docs/design/BOARD-45-COMPLETION-REGISTER.md` with PR # and deployed sha.

**YOU CERTIFY** Codex's boards 24–45 as each turns READY: the same 7, live. Mark it CERTIFIED or write the failing line; no partial certificates.

**Pace (READY count):** 02:45Z ≥4 · 06:45Z ≥8 · 10:45Z ≥12 · 14:45Z ≥16 · 18:45Z ≥20 · 22:45Z 23.
Miss → the board moves to Codex, and the Lead certifies.

---

# CODEX — ROUND 8.20 — DESIGNS: BUILD boards 24–45 start to finish + CERTIFY Cursor's 1–23 · deadline 2026-11-13 22:45Z
From Claude-Lead, 11-12-2026 5:50 PM CT (22:50Z). The readers you own stay yours: trial balance, cash flow, fuel KPI, factoring reserve/aging, PM odometer, settlements readers, formatDate.

**Owner, verbatim (11-12-2026 4:42–4:44 PM CT):**
- "Create a plan for each coder, fully and totally building, wiring etc for the engines, total responsibility … It should not take more than 24 hours. It has been weeks."
- "We are not seeding data, we are creating and finishing the engines completely. Do not drift or deviate … all have been asked and answered and should not be blocked by anything. Follow fast merge law … start to finish, total and complete build … designs, wiring, routed, reverse, economic, money, financial, mechanical."

**Measured 22:43Z** on origin/main `2709c8a8`:
- Boards fully certified: **0 of 45.**
- Register: **169 of 314** rows are not DONE.
- Engines not DONE: **27.** Every one is assigned below to exactly one seat. Nothing is shared, and nothing waits on another seat.

**WHAT "ENGINE" MEANS (no exceptions).** An engine is NOT a data fix or a seed. It is code that does the job automatically, every time, at the write path. Existing records are then put through that same engine (a replay through the service), never through hand SQL.

**EVERY ENGINE IS BUILT START TO FINISH IN THIS ORDER, in ONE PR per engine:**
1. **ENGINE.** One service function, one writer. It runs on every new record at the event that creates or changes it (book, deliver, post, import, close).
2. **MONEY.**
   - Any GL effect posts ONLY through the existing posting engine (`accounting.journal_entries`): balanced, tied to its source document, entity-correct.
   - Never a raw money INSERT or UPDATE.
   - Never write the right-hand legacy tables (`payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`, `mdata.qbo_vendors`).
3. **WIRING.**
   - The record links both ways to its hubs (`mdata.loads`, `mdata.drivers`, `mdata.units`, `mdata.customers`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`, `maintenance.work_orders`).
   - The PR carries the linkage declaration.
4. **ROUTE / UI.**
   - Where the result shows in the app.
   - Every number drills to its source record.
   - Back returns with the filters kept.
5. **REVERSE.** The undo path (void or reversal JE, unlink, re-open) is built and tested. Nothing is deleted.
6. **EXISTING RECORDS.** Run the SAME engine over the records already in production (replay). Post the count before and after.
7. **GUARD.** A `scripts/verify-*.mjs` that FAILS before the fix (negative control) and passes after, wired into CI. No exemption entries.
8. **TEST.** A real-Postgres test of the engine and its reverse.
9. **LIVE PROOF.** Deployed sha (healthz `git_sha` + `/version.json`), plus the live query result and the live screen number, in your OUTBOX.

**ALL QUESTIONS ARE ANSWERED. Owner rulings that apply:**
- Build engines first, match later (11-02). Do not mass-apply fuel matches.
- Do not lock any period yet (11-02). Build the lock engine, do not lock.
- Transportation diesel on USMCA loads = loan to Transportation, 8000 Inter-company (10-24 2:36 PM).
- Every real truck is owned by IH 35 Trucking and leased to USMCA.

If something looks blocked, the blocker is yours to fix in the same PR. You do not wait.

**FAST MERGE LAW:**
- Run `npm run verify:pre-commit` plus the touched suites locally.
- Push, then merge within 4 minutes of a green `required-checks-gate`.
- Claim a migration number in its own PR first.
- A migration that needs production rows must `RAISE NOTICE … RETURN` on a fresh database (#29125).
- Never merge with locked-guards red.
- Main red is everyone's P0: fix it within 15 minutes.

**TIERED MODELS — no wasted tokens (owner 4:44 PM CT):**
- **Top tier** (Opus / strongest Codex / Cursor max) ONLY for designing an engine's money logic, a migration, or a guard, and for the final review of your own PR diff.
- **Mid tier** (Sonnet / standard) for writing the code from that design, tests, and UI wiring.
- **Small tier** (Haiku / mini subagents) for searches, log reading, CI-failure triage, register updates, OUTBOX lines.
- Never re-read a whole large file. Grep, then read the exact lines.
- Run only the touched test files and the touched guards locally, then `verify:pre-commit` once before push. Never run the full suite in a loop.
- One PR per engine or board. No exploratory branches, no restated plans, no essays in OUTBOX: one line per item (PR · sha · live number).
- When CI fails, read the failing step's last 30 lines only, fix, push.

**HARD DEADLINE 2026-11-13 22:45Z (4:45 PM CT Friday).** Checkpoints are 02:45Z · 06:45Z · 10:45Z · 14:45Z · 18:45Z · 22:45Z. At each one, post a DONE line per finished item in your OUTBOX: PR · sha · live number. Miss a checkpoint and the item moves to the seat named below.

USMCA only. No test or sample rows in production. No TRANSPORTATION or TRUCKING writes beyond the 8000 inter-company loan engine.

**YOU BUILD, one board per PR. Overhaul: the approved v3 design REPLACES the page, and the legacy component is deleted in the same PR:**
24 Safety–Driver Files · 25 Reports Home · 26 Trial Balance · 27 Loads · 28 Driver Settlements · 29 Company Settlements · 30 Customers · 31 Vendors · 32 Settlements Home · 33 Open · 34 Closed · 35 Statement · 36 Pre-Settlements · 37 Close · 38 Cash Advances · 39 Escrow · 40 Escrow Register · 41 Deductions · 42 Company · 43 Fleet Health Line · 44 Truck service map · 45 ShopBays.
Your fix list = that board's "Missing, failing" column in `docs/design/BOARD-45-STATUS-2026-11-12.md`. You measured these defects yourself; close every one in the board's PR.

**EACH BOARD, START TO FINISH:**
1. **DESIGN.** Element census = the approved design at 1440×900. No legacy layer.
2. **ROUTED.** Canonical route, breadcrumb, tab and filter state in the URL.
3. **WIRED.** Every entity is a link both ways.
4. **REVERSE.** Back returns with the state kept.
5. **MONEY.**
   - Every amount drills to its source document and JE.
   - Statement arithmetic: gross − deductions + reimbursements = net.
   - Escrow running balance = sum of transactions.
   - Trial balance balances on both bases.
   - Card payables read 2510 / 2520, not fuel spend.
6. **FILTERS.** Every combination, multi-select.
7. **STATES.** Empty / loading / error / keyboard / actions.

Then mark it **READY** with PR # and deployed sha.

**YOU CERTIFY** Cursor's boards 1–23 as each turns READY: the same 7, live. CERTIFIED or the failing line.

**Pace (READY count):** 02:45Z ≥4 · 06:45Z ≥8 · 10:45Z ≥12 · 14:45Z ≥15 · 18:45Z ≥19 · 22:45Z 22.
Miss → the board moves to Cursor, and the Lead certifies.
