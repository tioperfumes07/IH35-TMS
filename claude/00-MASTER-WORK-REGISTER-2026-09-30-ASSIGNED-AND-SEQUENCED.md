# MASTER WORK REGISTER — 2026-09-30 — ASSIGNED AND SEQUENCED
# EVERY SEAT: THIS IS YOUR WORK LIST. READ IT FROM THE REPO, NOT FROM A HANDOFF.

Owner law in force:
- You COMPLETE your item. You BUILD it. You DEPLOY it. No handing off, no
  "next seat picks this up", no "blocked on another seat" unless the owner
  said those words.
- Live means live. If the owner cannot open it in Chrome and click it, it is
  not done.
- Never report done without proof: the live row, the live screen, the live
  query — pasted.
- USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). Reads:
  SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia';
- Never write a test/sample/demo row into USMCA, including for proof.
- `--no-verify` forbidden. Nothing stays local — push it.
- Every Claude Coder and Cursor may work mechanical, economic, money and
  accounting items. There is no lane that bars you from finishing your item.

---

## P0 — ROOT CAUSE FOUND 2026-09-30, MEASURED LIVE. THIS BLOCKS THE BOARD.

### T-01 (CC-3) — LOAD STATUS HAS NOT ADVANCED SINCE 2026-09-28. ARRIVAL
### DETECTION IS WIRED TO A WEBHOOK THAT HAS NEVER FIRED.

Measured live on br-fancy-credit-akjnd07a, 2026-09-30:

  integrations.samsara_vehicle_positions   129 rows, last 2026-09-30 12:31:45Z  ALIVE
  integrations.samsara_webhook_events        0 rows, ever                        NEVER FIRED
  integrations.samsara_webhook_projection_state 0 rows                           NEVER RAN
  dispatch.stop_arrivals                     0 rows, ever                        NEVER WROTE
  geo.geofence_state_transitions          7596 rows, last 2026-09-30 12:06:42Z  ALIVE

  All 16 open loads: status = 'dispatched'. Newest status write 2026-09-28.
  T148/13625, T148/13635, T152/13633, T152/13634, T156/13626, T156/13629,
  T164/13630, T168/13632, T170/13627, T171/13628, T173/13639, T174/13631,
  T175/13636, T176/13637, T176/13638, T177/13624.

Code path, read from the branch:
  `processArrivalDetectionsForGpsPoint` (apps/backend/src/telematics/
  arrival-detection.service.ts) has exactly ONE caller:
  apps/backend/src/integrations/samsara/webhook-projectors/vehicle-projector.ts
  That projector runs only on webhook events. There have been none.
  Positions are written by apps/backend/src/jobs/samsara-position-poll-worker.ts,
  which never calls arrival detection.

**Therefore the Truck Line green node stuck on "Dispatched" is NOT a frontend
defect.** The board is honestly rendering a status column nothing has written
in two days. FARO/AlwaysTrack say the trucks are rolling; the app disagrees;
by owner law the app is the defect — and this is where the defect is.

CC-3 job, finish it end to end:
1. Call arrival detection from the polling path, on every position the poll
   worker persists — not only from the webhook projector. Keep the webhook
   path; add the poll path. Idempotent per (load, stop, arrival window).
2. Backfill from the 129 live positions + 7596 geofence transitions so the
   16 loads land on their true station today.
3. Prove it: paste the stop_arrivals rows created, and the live status of all
   16 loads after, and the Truck Line screen showing the green node moved.
4. Guard it: scripts/verify-arrival-detection-runs-on-poll-path.mjs +
   scripts/verify-steps/NNN-*.mjs, with a selftest that fails when the poll
   path stops calling detection.
5. Alarm it: a load in 'dispatched' with fresh GPS more than N hours old is a
   silent failure. Surface it. No silent failures.

---

## P0 — MONEY

### M-01 (CC-2) — THE 16 DISPATCHED LOADS' UNAUTHORIZED DOCUMENTS
Ruling: docs/bus/2026-09-30-LEAD-RULING-CC2-PURGE-SCOPE-NARROWED-OWNER-QUOTED.md
- DELETE the 14 zero-line / zero-posting proforma pre-invoices ($61,375 face,
  no ledger impact). Owner-authorized, quoted in the ruling.
- The 2 SENT invoices ($9,650): VOID with dated reversing JEs. DO NOT DELETE.
- DO NOT delete legitimately-voided real transactions. That order is WITHDRAWN.
- Proof: per-load counts, pre-delete 0-line/0-posting proof, reversal JE ids,
  TB delta $0.00 for the 14, live query of the 16 loads after.

### M-02 (CC-2) — FARO 09-25 IS THE SOURCE OF TRUTH. IMPORT IT.
The empty factor.faro_invoice_lines meant the importer never loaded the files,
not that the loads were unfactored. That error cost real voids that had to be
reversed (AUTH-173). Import the Faro CSVs, then reconcile EVERY advance
against Faro's own file before any further factoring write.
Faro 103 = LOGIMAX $6,250 net adv $6,062.50. Faro 104 = FLS $3,400 net adv
$3,298.00. Both purchased and wired 09/25/2026.

### M-03 (CC-1) — TEST ROWS LIVE IN USMCA. P0.
Ruling: docs/bus/2026-09-30-LEAD-RULING-CC1-TEST-ROWS-IN-USMCA-ARE-P0.md
"CC-2 live-test check" $25.00 and "AUTH-NNN proof line" $1.00 rows are a
standing-law violation. Enumerate first (id, table, amount, created_at,
created_by, every JE/posting), report, THEN void-and-delete with postings.
Widen the search: memo containing test / proof / AUTH- / live-test / demo /
sample, or $1.00 / $25.00 round proof amounts written by a seat in 14 days.
Never write a new test row to prove this one.

### M-04 (CC-1) — 120 UNRESOLVED ITEM IDS, $4,901.31
Leave them NAMED. Do not guess a mapping to close a count. Resolve the ones
you can prove from the signed document; report the rest by name and amount.

### M-05 (CC-2) — 286 BANK LINES
Load and present them. **The owner matches. Seats do not match.** Your job is
that every line is present, correctly dated, correctly signed, and linked to
its source document — not that it is matched.

---

## P1 — THE OWNER'S UI DEFECT REGISTER (CURSOR, then CC-1 on data shape)
Full text: claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md (D01–D54)

QuickBooks parity — Cursor:
  D47  QuickBooks calendar/date format, app-wide
  D48  QuickBooks number format and styling, app-wide
  D49  Banking "Action" column at QuickBooks text size
  D50  Row rules yes, column rules no          — SHIPPED 4a30763952, verify live
  D51  Header text one step larger than rows   — SHIPPED 4a30763952, verify live
  D52  Larger multi-select control
  D53  Printer + export icons, QuickBooks placement
  D54  Add / Match / Record transfer actions in Banking

Master-detail and shell — Cursor:
  D34  Master-detail split is 440px against 1662px. Widen the master pane.
  D35  Driver Profile adopts the Customers/Vendors master-detail shell
  D37  Master-detail is the DEFAULT in code, not a toggle the user finds
  D38  Segmented controls — contrast, the owner cannot see the active state
  D39 / D10  Minimum-scroll: the screen must be usable without hunting

Modules — Cursor:
  D02–D08  Cash Flow + Banking
  D11–D20  Driver Profile
  D21–D23  Customers / Vendors  (incl. default to records WITH transactions)
  D24–D33  Maintenance

Contrast and line distinction is the owner's single most repeated complaint
across the whole app: "THERE ARE NO DISTINCTION IN LINES, ANYTHING, IT IS
KILLING ME THROUGHOUT THE ENTIRE APP." Treat it as one system fix, not 30
one-off patches.

---

## P1 — DISPATCH BOARD (CURSOR)

### K-01 — KANBAN CARDS DO NOT DRAG FOR THE OWNER. "IVE REQUESTED THIS 1000 TIMES."
Measured live 2026-09-30 on the deployed build: 20 nodes carry
aria-roledescription=draggable and cursor-grab, so dnd-kit IS attached.
The affordance exists and the gesture still does not move the card for the
owner. So the defect is in activation or in the drop target, not in whether
useDraggable was called.

Do NOT close this by pointing at the attributes. Reproduce the owner's actual
gesture — press, hold, move slowly, from Dispatched to At pickup — and fix
what actually blocks it: activation constraint distance/delay, a scroll
container stealing the pointer, a droppable whose id does not match
normalizeStatusToColumnKey, or the column not registering as a drop target.
Proof = a recording or a live status change in the database from a drag.

### K-02 — TRUCK LINE, ALREADY SHIPPED, VERIFY LIVE AND CLOSE
  - Status filter is now the house Combobox (verified live: role=combobox,
    200px at x=170,y=277). CLOSED unless the owner still sees the old box.
  - Section band now counts legs, not groups: TOUR·15 + IN TRANSIT·1 +
    AVAILABLE·2 = 18 rows. CLOSED.
  - "Loads appear in the wrong section" and "the green circle is off" are
    T-01, not this board. Do not patch the board to hide stale data.

---

## P1 — LOAD COSTS (CC-1)

### L-01 — LOAD COSTS RENDERS 14 OF 16. 13625 AND 13626 ARE MISSING.
All three APIs (load-costs-board, mdata/loads, dispatch/truck-line) return all
16. The board drops two on render. Measured at 22s, so it is not the render
delay. Find why those two specific loads fall out and fix it. All load board
views must show the same loads.

---

## P2 — GUARDS AND CI (CODEX)

### X-16 — SKIP COUNTING. PUSH IT AND GET REAL CI PROOF.
Local commits 1b7bfca7ad and c9ab31562f, 12/12 local. Nothing stays local.
Push, open the PR, paste the PR number, the workflow run URL, the run's
conclusion, and the skip-count lines the run itself printed. Local tests are
your bench, not the proof.

### X-17 — 222 SWALLOWED DB ERRORS IN 142 FILES
Baseline is measured and wired. Burn it down. A swallowed DB error inside a
transaction is exactly how a settlement silently loses a line.

---

## SEQUENCE

1. CC-3 T-01 — nothing on the dispatch board is trustworthy until status moves.
2. CC-2 M-01, then M-02 — stop the unauthorized documents, then get Faro in.
3. CC-1 M-03 — get the test rows out of USMCA before anything else of yours.
4. CC-1 L-01, M-04.
5. Cursor K-01, then D47–D54, then D34–D39, then the module blocks.
6. Codex X-16 to green CI, then X-17.

Nobody waits on anybody. Your item is yours to finish.
