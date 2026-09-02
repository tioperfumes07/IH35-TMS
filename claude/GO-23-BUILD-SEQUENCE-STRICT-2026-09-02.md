# GO-23 — THE BUILD SEQUENCE. STRICT. MUST FOLLOW.

Owner ruling 2026-09-02. **This is the order. No seat picks its own next row.**
A seat that ships out of order has shipped nothing.

Supersedes every earlier queue note. Registers merged into one board:
- this session's book-load defects (GO-21, 49 rows)
- `docs/bus/IH35-OWNER-REQUIREMENTS-MASTER-MAP.md` (~60 requirements, 9 unowned)
- `DEFECT-CLASS-REGISTRY-2026-07-25.csv` (9 systemwide classes, all open since July)
- the two rescued spreadsheets (516 MUST rules, 262 error codes, 31 locked invariants, 230 tasks)

**67 board rows. 18 of them had no owner at all.** That is the number that matters.

## THE LAW FOR THIS QUEUE

1. **Waves run in order.** Seats inside a wave run in parallel. You do not start a
   wave-3 row while a wave-1 row in your lane is open.
2. **A defect not on the board does not exist.** Do not open a new register. A new
   file is never the answer — four registers is exactly how 18 rows lost their owner.
3. **Vertical.** Data, backend, interface, screen, guard, proof. Done = the owner
   clicks it in Chrome. J1 is the single exception: it is a horizontal standard with
   no data layer, and its guard is what keeps that exception honest.
4. **Systemwide.** Fix it everywhere it exists, not on the screen it was found on.
   Report the count you found and the count you fixed. They will differ — say so.
5. **Guard before migrate.** Ship the CI guard first so nothing new is written while
   you work, then migrate behind it. Migrating first is how 2,220 raw sizes accumulated.
6. **Never invent a locked value.** `docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md` is
   owner-locked 2026-06-07. Transcribe it. Proposing a scale violates an owner decision.
7. **Seats never POST Book Load.** The owner books. Need a live repro, write it to
   your OUTBOX and ask.
8. **A merged PR is not a fixed screen.** CC-2 verifies live in Chrome and reports
   FIXED or NOT FIXED with numbers.

---

## WAVE 1 — TODAY. The owner cannot enter a real load until these are done.

| # | Row | Seat |
|---|---|---|
| 1 | **A2** customer picker returns the whole set — capped at 500/200 against ~2,700 customers, `BookLoadCustomerSection.tsx`. Ships alone, first. | CC-3 |
| 2 | **A1** trailer interchange, data + backend. Load 13508 ran on a broker's trailer with nowhere to record it. Never put a non-owned trailer in `mdata.units`. Post the ledger file to `INBOX-CC-3` on merge. | CC-1 |
| 3 | **N1** create an expense from a load. `ExpenseCreatePage` is routed at `/accounting/expenses/new` but nothing in dispatch or on a load reaches it, so load-scoped cost cannot be entered. Master map 11.5: 129 NULL expense numbers. | CC-1 |
| 4 | **A3 / B12** owner re-drives the failed save to confirm #19571 names the exact stop and rule. | Codex |
| 4b | **GO-24** wire **existing** `mdata.locations` into Book Load stops (picker + fill address + inline add). **Do not create `catalogs.locations`.** Spec `docs/specs/0251-stop-location-catalog-design.md` is STALE — mark SUPERSEDED in the same PR. Remove or gate dead geocode UI (`enabled:false`). Mileage / `catalogs.lane_mileage` is **CLOSED** — do not reopen. | CC-3 screen · CC-1 backend only if search/create is missing |

**Owner 2026-09-02 (live):** a written spec is a claim, not a fact. Before building from any spec, verify live schema in the PR. Production wins; mark the spec SUPERSEDED, never delete.

In parallel, no dependency: **CC-2** registers the J1 ratchet as a required verify-step. **#19641** registered the workflow + local gate; git baseline on tip is 2218/268 PASS. Live GitHub branch protection may still be unset.

## WAVE 2 — THIS WEEK. Money is live. Protect it.

| # | Row | Seat |
|---|---|---|
| 5 | **C6** money INSERT without a balanced journal entry — 221 hits, HIGH, open since July, guard spec already written and never built. Highest-risk row on the board now that money moves. | CC-1 |
| 6 | **A1** interchange screen. Our trailer or an interchange trailer, never both. | CC-3 |
| 7 | **B8** cash and fuel advances fully wired — Comchek/Comdata/EFT/wire reference, linkage to load + driver + settlement deduction, receipt into `docs.files`, pending until approved. | CC-1 |
| 8 | **B5** driver pay rate resolves from the driver profile. A typed rate is how a settlement goes wrong silently. | CC-1 |

## WAVE 3 — SETTLEMENTS (GO-22). Mostly already built.

`trip_type` NB/TR/SB, `tour_id`, `presettlement_link_id`, first/last load and the
bookended service all exist. One query service was never written.
**Zero settlements have ever existed — nothing here is proven.**

| # | Row | Seat |
|---|---|---|
| 9 | **GO-22a** settlement number generator. Trap: counters use `LD` while the load allocator queries `LOAD`. Match one, never invent a third. Never `MAX()+1`. | CC-1 |
| 10 | **GO-22b** pre-settlement query service + manual path. Closes the TODO at `book-load.service.ts` ~2264 and removes the deferred log. Recommend, never auto-commit. Manual attach/detach in the same slice. | CC-1 |
| 11 | **Slice 20** company settlement 5753, P&L 2415.11. | CC-1 |

**OWNER DECISION NEEDED BEFORE STEP 10:** if a tour has an NB and two TRs but no SB
and the driver needs paying, does the pre-settlement close early on legs delivered, or
stay open until he is back in Laredo? The trip_type migration assumes SB arrival in
Laredo closes it. Do not guess.

## WAVE 4 — THE DESIGN SYSTEM. One job, finished. Not a program.

| # | Row | Seat |
|---|---|---|
| 12 | **J1** transcribe the locked baseline, migrate to zero. 1,083 off-scale across 342 files, 203 with only one or two. Section D first, then the top 50 files (45%), then the tail. Closes C1–C3, D1–D5, E2, E3, F2, F4, H3, I1. | CC-2 |
| 13 | **K2** one combobox, 268 files. Only `components/Combobox.tsx` dismisses on outside click. EntityPicker 106, SelectCombobox 154, shared/Combobox 8. Also closes B9. | CC-2 |
| 14 | **C1** raw UUIDs on operator surfaces app-wide — 30 hits, 27 actionable, open since July. Closes B2 systemwide. | CC-3 |

## WAVE 5 — THE SCREENS THE OWNER WORKS IN DAILY. Adopt CC-2's tokens; invent nothing.

| # | Row | Seat |
|---|---|---|
| 15 | **Wizard cleanup** B1, B3, B4, B7, K1, K3, K4, K5. | CC-3 |
| 16 | **Columns, filters, search — systemwide.** Master map §2, queued since 2026-09-01: sortable everywhere, columns movable by drag, auto-fit for payee/vendor/state, filters as combo boxes, search over amount / load # / PO / BOL / date / status rendering true data, gear to choose what to view, voided hidden by default. | CC-3 |
| 17 | **Boards and planners** E1, F1–F3, G1–G4, H1–H6, I2, I3. G4: the owner already specified trip pairing — follow it, do not redesign. | CC-3 |
| 18 | **C7, C5** 134 modals that should be the 480px drawer; 15 non-canonical `?load_id=` links. | CC-3 |

## WAVE 6 — THE DROPPED MODULE. Unowned since 2026-09-01.

Eight insurance tables exist. The owner uploaded signed policies, premiums and COIs.
**Zero documents are attached to any unit.** Assigned to CC-3 and displaced by UI work.

| # | Row | Seat |
|---|---|---|
| 19 | **L1, L2, L7** COI + ID card on each unit; policies with truck and trailer values; `mdata.assets` has 0 trailers and `insured_value_cents` empty on all 90. | CC-3 |
| 20 | **L3, L5** COI request workflow by company email; T144 removal / T163 tracking. | CC-3 |
| 21 | **L4, L6** TRK → USMCA lease at monthly × 1.16; the $10,000 unaccounted on the EDSA down payment. | CC-1 |
| 22 | **L8, L9** dispatcher confirmation + owner override; wire code to `has_permission()` instead of role strings. | CC-3 |

## WAVE 7 — THE REST OF THE CLASS REGISTRY, AND THE GO-20 TAIL.

| # | Row | Seat |
|---|---|---|
| 23 | **C2 STOP-CLASS** RETIRE-schema live writes into `maint.*` / `payroll.*` / `settlement.*` / `bank.*`. Repoint the writer, never drag the FK. | CC-1 |
| 24 | **C3, C4, C8, C9** native date inputs (23), localStorage business settings, dead KPI cards and dead clicks, rendered field dropped on save. | CC-3 |
| 25 | **GO-20 tail** slice A screen (backend + cron exist, no frontend route, so not done), DRIVER-F7334, leftover D, prove H live. | CC-1 |
| 26 | **Reconcile the two rescued spreadsheets** against this board — 516 MUST rules, 262 error codes, 31 locked invariants, 230 tasks. Last unchecked source. Unique FINDING only, do not build. | Cascade |

---

## STANDING, THROUGHOUT

- **CC-2 verifies every fix live** in Chrome and reports FIXED or NOT FIXED with measured
  numbers. Devin-A is retired; that job is CC-2's.
- **Cascade** files unique FINDINGs only. 12 and 13 stay HOLD. Closing already-fixed
  `GUARD-WORKORDERS` rows is cleanup; dispatching from that board is forbidden, and so
  are the `Downloads` queues.
- **Nothing is done without proof** — the live row, the live screen, the live query, pasted.
