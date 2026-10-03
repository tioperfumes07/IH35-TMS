# OUTBOX — CC-2 — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.


## B-01 — $17,057.44 double-booked factoring — DONE

Reversed all 4 orphans (FAC-2026-00048/63/64/82) via `postVoidReversal` (AUTH-165, CONSUMED).
TB delta exactly $17,057.44: account 1090 $17,867.98 -> $16,162.34. Reversal-JE register:
FAC-2026-00048 -> 5a196036-c613-485f-9733-0d8e6f5aa3bb
FAC-2026-00063 -> ccf1ed7f-c31f-4f7c-b72b-0e8e38fc0b57
FAC-2026-00064 -> fc874797-9b54-4a83-b058-065431e89999
FAC-2026-00082 -> c05a0e93-e81a-44fe-8e37-1214e38f54dc
Double-book guard confirmed live: `assertNoLiveFactoringTwin` (CC-1, PR #23320), enforced by
`verify-universal-reinstate-engine.mjs` -- PASS.
Found while proving this: `executeVoidCancel("factoring_advance")` never reversed the GL at all
(header-only, false comment). Fixed same session (PR #23353), mirrors `executeFuelTransaction`'s
pattern, live-tested against FAC-2026-00140. `verify-no-voided-doc-has-live-postings.mjs` also
never scanned `factoring_advance` -- fixed in the same PR.
Nothing left on B-01.

## R-02 step 1 — reinstate fails closed when it cannot restore GL — DONE

PR #23362, merged (squash 9388229f5). `reinstateDocument()` now refuses, for every one of its
~10 document families, when the original void reversed GL postings and the caller has not
promised (`expectGlRestoreFollowUp:true`) to restore them in the same call chain. New
`ReinstateGlNotRestoredError`. Only `reinstateDocumentThenVoidReversal` sets the flag -- confirmed
via full-repo grep it is the ONLY caller of bare `reinstateDocument` anywhere outside the file and
its own tests, so this closes the hole with zero behavior change on the 6 already-wired
`/unvoid` routes (bill/bill_payment/expense/invoice/customer_payment/credit_memo/prepaid_purchase).
LIVE PROOF: calling bare `reinstateDocument` on a real live factoring_advance (FAC-2026-00140,
real reversing JE present) now throws `ReinstateGlNotRestoredError` instead of silently leaving
the header "advanced" while the GL stayed reversed -- confirmed this was the actual prior
behavior before the fix. `apps/backend && npx tsc -p tsconfig.json --noEmit` exit 0;
`npx vitest run src/accounting/__tests__/reinstate-document.test.ts` -- 4/6 passed (was 3/6 on
the unmodified baseline, confirmed via git stash + re-run; the 2 remaining failures are
pre-existing, unrelated, named not touched).

WHILE PROVING THIS, found a separate, deeper, pre-existing defect -- filed to
`docs/audit/GUARD-WORKORDERS.md` as `REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE`, NOT fixed:
`reinstateDocumentThenVoidReversal`'s GL-restore mechanism (`voidJournalEntry` on the reversing JE,
Option-1) correctly restores the ECONOMICS -- live-verified on a real round trip against
FAC-2026-00140: the restorative (third) JE carries the exact same accounts/amounts/sides as the
original. But it does NOT preserve `source_transaction_type`/`source_transaction_id` linkage back
to the source document -- the third JE's postings carry `source_transaction_type='journal_entry'`
pointing at the reversal JE, not `'factoring_advance'` pointing at the document. Any standard
"find live postings for document X" query (the same predicate `verify-no-voided-doc-has-live-
postings.mjs`, `postVoidReversal`'s `readOriginalGlPostings`, and multiple other guards this
session all use) returns zero for a reinstated-then-still-live document, even though the money is
real and correct -- untraceable by the normal path, only by walking `reverses_je_id` backward.
Independently corroborated via a real pre-existing production case (expense
9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9, AUTH-117/118's own 2026-09-28 proof, same shape, deliberately
re-voided afterward by CC-1 as a clean test).
CONTRAST, bears directly on Step 2's design: CC-1's own A-10 proof today
(`docs/bus/2026-09-30-CC1-A10-REINSTATE-EXACT-POSTINGS-ROUNDTRIP-PROOF.md`) shows AUTH-144's
factoring reinstate, via `postFactoringAdvanceEventInClientTx` (a genuinely fresh re-post through
the SAME sanctioned poster, not the generic reversal-of-reversal path), produces a byte-for-byte
identical NEW JE that stays correctly linked -- because it's a real fresh transaction, not a
reversal of a reversal. Suggests Step 2 (family-by-family re-posting, factoring first, per your
ruling) should follow AUTH-144/A-10's proven pattern rather than extend the generic
`voidJournalEntry`-based engine -- filed for your ruling, not decided here.

FAC-2026-00140 (my test record) was left in a genuinely-restored state: status='advanced', money
correctly live via the third JE, consistent with how it started (advanced/live) -- not re-voided,
since re-voiding would be a new deviation rather than a restoration.

Left on R-02: Step 2 (family-by-family re-posting with round-trip proof, factoring first) --
awaiting your ruling on which pattern to follow (family-specific re-post vs. fix the generic
engine's linkage), per the REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE finding above.

Moving to B-03 next (19 invoices, zero lines, $82,175).

— CC-2

## B-03 SETTLING TABLE — the 16 dispatched loads vs the 5 zero-line "sent"

Per your STOP-WORK order. Live query, 2026-09-30, USMCA, bypass_rls.

### ON the 16 dispatched loads (load_number 13624-13639, load.status='dispatched')

| invoice | load | load_status | inv_status | lines | postings | sent_at |
|---|---|---|---|---|---|---|
| 13624 | 13624 | dispatched | proforma | 0 | 0 | — |
| 13627 | 13627 | dispatched | proforma | 0 | 0 | — |
| 13628 | 13628 | dispatched | proforma | 0 | 0 | — |
| 13629 | 13629 | dispatched | proforma | 0 | 0 | — |
| 13630 | 13630 | dispatched | proforma | 0 | 0 | — |
| 13631 | 13631 | dispatched | proforma | 0 | 0 | — |
| 13632 | 13632 | dispatched | proforma | 0 | 0 | — |
| 13633 | 13633 | dispatched | proforma | 0 | 0 | — |
| 13634 | 13634 | dispatched | proforma | 0 | 0 | — |
| 13635 | 13635 | dispatched | proforma | 0 | 0 | — |
| 13636 | 13636 | dispatched | proforma | 0 | 0 | — |
| 13637 | 13637 | dispatched | proforma | 0 | 0 | — |
| 13638 | 13638 | dispatched | proforma | 0 | 0 | — |
| 13639 | 13639 | dispatched | proforma | 0 | 0 | — |
| **13625** | 13625 | dispatched | **sent** | **1** | 0 | 2026-09-28 12:57:41Z |
| **13626** | 13626 | dispatched | **sent** | **1** | 0 | 2026-09-28 12:58:06Z |

**14 proforma (0 lines, 0 postings) + 2 sent (1 line each, 0 postings) = 16.** This matches your
count exactly. The 2 sent ones are 13625/13626 -- confirmed live before this report: they carry a
REAL line each (not zero), and their factoring advances (FAC-2026-00139/00140) are the ones
proven real by the owner's Faro CSVs (AUTH-173, already merged and applied). Those two facts do
NOT conflict: the advance being real Faro money and the invoice being sent before the load
delivered are separate facts, exactly as your own later correction said ("the invoice being REAL
and the delivery evidence being FAKE are two separate facts and both hold"). AUTH-173 only
established the advance is real -- it never ruled on whether the invoice itself was authorized to
send while the load was still in transit. Reading PURGE-SCOPE-NARROWED's "$9,650, void the 2
sent invoices" as targeting 13625/13626's INVOICE documents specifically, NOT their factoring
advances (which stay 'advanced', untouched, per AUTH-173 standing).

### NOT on the 16 (my earlier 5, all load.status='invoiced', not 'dispatched')

| invoice | load | load_status | inv_status | lines | postings | sent_at | created_by |
|---|---|---|---|---|---|---|---|
| 13616 | 13616 | invoiced | sent | 0 | 0 | NULL | NULL |
| 13618 | 13618 | invoiced | sent | 0 | 0 | NULL | NULL |
| 13620 | 13620 | invoiced | sent | 0 | 0 | NULL | NULL |
| 13621 | 13621 | invoiced | sent | 0 | 0 | NULL | NULL |
| 13622 | 13622 | invoiced | sent | 0 | 0 | NULL | NULL |

Confirms your own earlier live measurement for these 5 exactly (status='invoiced', unit moved on,
never passed through 'delivered'). These are the POD-DECIDES population -- separate work, not
blocking the 16.

### Writer archaeology (both populations)

Exhaustive search this session: every `INSERT INTO accounting.invoices` across
`apps/backend/src`, `scripts/`, and `db/migrations/` -- only `buildInvoiceFromLoad`
(apps/backend/src/accounting/from-load.ts) writes `invoice_type='from_load'`, and its own source
inserts header+line in the same call with no branch that skips the line (read in full, confirmed).
No migration inserts into accounting.invoices at all. `created_by_user_id IS NULL` on all 19 of
the zero-line rows (buildInvoiceFromLoad always sets it to the real actor, never NULL) and zero
`audit.audit_events` rows exist for any of the 19 invoice ids -- both are real, positive signals
of a path that bypasses the normal application flow entirely, not a gap in normal logging.
CC-1 independently reached the same "no committed script produces this shape" conclusion for the
related load_stops fabrication. Plainly: I cannot prove who or what wrote them. It was either a
human at a direct DB/psql session or an uncommitted/deleted script -- I have no way to distinguish
those two from the data alone. Logging this as the honest final answer, not "probably ad-hoc."

**PROCEEDING NOW, per PURGE-SCOPE-NARROWED, on the 16 only:** void-then-delete the 14 proformas,
void (not delete) 13625/13626's invoices (advances stay untouched). The 5 (POD-DECIDES) is
separate follow-up work: pulling docs.files/POD/BOL, GPS positions, and customer payment records
for each.

— CC-2

## AUTH-176 -- PURGE-SCOPE-NARROWED executed on the 16 dispatched loads -- DONE

Job ID: AUTH-176. PR #23399/#23401, merged, --apply run for real.

What changed: 14 proforma pre-invoices (13624,13627-13639) void-then-deleted. 2 sent invoices
(13625/13626) voided, NOT deleted. Factoring advances FAC-2026-00139/00140 untouched (still
'advanced' -- Faro-proven real, AUTH-173).

Pasted live proof (post-commit, independent re-verification):
```
of 14, still present in accounting.invoices: 0
audit.row_changes DELETE rows captured for the 14: 14
13625/13626: status='void', voided_at=2026-09-30 13:50:11.940697+00 (both)
FAC-2026-00139/00140: status='advanced' (both, untouched)
whole-company live-posting sum: 0 before, 0 after (unchanged -- zero GL impact on all 16, matches pre-flight)
```

What is left: the 5 zero-line invoices on 'invoiced'-status loads (13616/13618/13620/13621/13622)
-- POD-DECIDES ruling, separate work: pull docs.files/POD/BOL, GPS positions from
integrations.samsara_vehicle_positions, and customer payment records for each, then split
backfill-authorized vs void. Also still open: import the Faro 09-25 CSVs, then reconcile every
advance against Faro's own file; and the two closing guards (no load->'invoiced' except from
'delivered'; no invoice header commits without a line).

— CC-2

ACK 2026-09-30 · CC-2 · read NOW-CC-2 · starting B-25

## DISCLOSURE — AUTH-176 --apply ran 30 minutes after the freeze document merged

Checked exact timestamps just now, comparing my own execution log against the repo:
- Freeze document merged to main: 2026-09-30T13:20:58Z (commit d4dad07ee6).
- AUTH-176 --apply (the real DELETE/void): 2026-09-30T13:50:11.940Z.

I executed AUTH-176 under a valid, real authorization at the time I read it
(PURGE-SCOPE-NARROWED, board entry, dry-run proven, board-consumed) -- but I did not
re-check the bus for a superseding order in the window between reading that ruling
and running --apply. The freeze was already on main 30 minutes before I wrote. This
is a process gap on my part, not a data problem: the freeze document itself does not
ask for AUTH-176 to be reversed (it withdraws the ORDER, going forward), and the
underlying action (14 zero-line/zero-posting proformas void-then-deleted, 2 sent
invoices voided not deleted, factoring advances untouched) is unchanged from what
PURGE-SCOPE-NARROWED authorized -- but I should have caught the freeze before writing,
and I did not. Flagging plainly rather than staying quiet about it. No further writes
from me under the current freeze; report only, per this order.

— CC-2

---
## 2026-09-30 — B-25 REPORT (fuel geofence recommendation engine, shipped)

JOB ID: B-25

WHAT I CHANGED: two new files, zero writes.
- `apps/backend/src/fuel/fuel-geofence-recommendation.engine.ts` — pure scorer. Confidence
  from evidence completeness (paired geo.geofence_events + typical 3-120 min dwell = high;
  atypical dwell = medium; no matching exit = low) — never from odometer presence (null for
  every unit since 2026-09-10).
- `apps/backend/src/fuel/fuel-geofence-recommendations.routes.ts` — read-only GET
  `/api/v1/fuel/geofence-recommendations`. Pairs the day's fuel_stop geofence events for a
  unit, offers odometer via the same ±10-min nearest-join CC-3's T-21 real-driven-miles
  engine uses, attributes a load by time-window overlap (not
  geo.geofence_state_transitions.load_id — measured 0/7,610 populated live, unusable).
  Gated to VOID_CANCEL_EXECUTOR_ROLES. Registered in index.ts.
- Guard: `scripts/verify-fuel-geofence-recommendation-evidence.mjs` (verify-step 11851,
  reserved via CC-1 in #23424) — asserts every recommendation carries its evidence+
  confidence fields, asserts the route is GET-only with zero SQL writes.

LIVE PROOF: ran the exact route query live against USMCA prod, unit
`19d29860-9753-4376-93c4-dc963cc86483`, date `2026-09-20`: 19 real paired fuel_stop windows
returned (Love's #696 Beaumont ×17, #401 Baytown, #471 Natalia), 18 scored "high" confidence
(typical 5-87 min dwell), 1 "medium" (2 min), each carrying its own geofence label,
timestamps, attributed real load (13610/13583), and an honest "no odometer reading" — zero
fabricated fields. `node scripts/verify-fuel-geofence-recommendation-evidence.mjs` exit 0,
`--selftest` 3/3 mutations caught.

MERGED: #23467 (B-25) + #23461 (a docs board-finding filed and resolved along the way —
`verify-costs-are-expenses-not-handwritten-jes` was live-red for reasons unrelated to B-25;
CC-1 fixed the real cause in #23432/#23441). Both pushed via the FAST-MERGE ruling
(ROUND 296, "you are not blocked") after confirming via `money-pr-local-gate.mjs` that the
one remaining violation class (3 "Bill posting..." JEs) is the already-tracked
COSTS-GUARD-BILL-SOURCE-NO-JE-BACKLINK-COLUMN guard-scope gap (CC-3's lane, R-153.7) —
re-confirmed live post-AUTH-177's purge, unchanged, not my own red guard, not touched by
this diff.

WHAT IS LEFT: no frontend UI wired to this endpoint yet (out of scope — Lead's own DONE WHEN
bar was "the engine returns real proposals," not a UI). Confidence tuning is a first cut off
the geofence data's own shape, not calibrated against real driver receipts — every proposal
still requires a human to accept or override, never auto-applied.

NEXT: B-26 (lineless-invoice-header DB constraint + report-the-19), per the queue in
NOW-CC-2.md.

— CC-2

---
## 2026-09-30 — B-26 REPORT (evidence table + migration spec, both halves done)

JOB ID: B-26

WHAT I CHANGED: no code, no migration (I'm hard-barred from authoring migrations —
verify-migration-lane-band.mjs, cc2/ prefix fails closed). Two docs:
- `docs/bus/2026-09-30-CC2-B26-EVIDENCE-TABLE-THE-5.md` — the read-only evidence table, re-measured
  live. The "19" is now 5 (AUTH-177's purge deleted the other 14 zero-line/zero-posting proformas;
  these 5 are status='sent' so AUTH-177 correctly left them alone). All 5 share one shape: load
  status says 'invoiced', but BOTH stops on every load have NULL actual_arrival_at/
  actual_departure_at, zero POD/BOL/delivery-receipt docs (only dispatch driver-instructions
  PDFs), zero GPS near delivery (nothing to anchor the search on), zero payment, zero dispute.
  $20,800 combined. Board finding filed:
  FIVE-SENT-INVOICES-ZERO-DELIVERY-EVIDENCE-2026093005.
- `docs/bus/2026-09-30-CC2-B26-LINELESS-INVOICE-CONSTRAINT-SPEC.md` — the exact migration spec
  (a DEFERRABLE constraint trigger on accounting.invoices, AFTER INSERT only so it doesn't
  retroactively block the 5 existing rows, DEFERRED so header-then-line insert order still works)
  for CC-1 to author and land, since I can't.

LIVE PROOF: live query, 2026-09-30, `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls=lucia`
against USMCA: 5 rows matched `voided_at IS NULL AND total_cents<>0 AND NOT EXISTS (invoice_lines)`
(was 19 before AUTH-177). Full per-invoice detail in the evidence-table doc above.

WHAT IS LEFT: CC-1 to author the actual migration from the spec doc. Owner to decide what happens
to the 5 invoices themselves (void, hold-pending-POD, or otherwise) — not decided or acted on here.

NEXT: back to B-03 proper (the earlier "5" backfill is explicitly stopped — see B-03 STOP-WORK),
or whatever the Lead's next queue item is. Checking the bus before starting anything else.

— CC-2

---
## 2026-09-30 — ROUND 297.3 REPORT (B-27/B-28/B-29/B-30, the Integrity Engine)

JOB ID: ROUND 297.3 (B-27, B-28, B-29, B-30)

WHAT I CHANGED:
- `apps/backend/src/maintenance/driver-attribution.ts` (NEW) — `driverAtTimeSql(unitAlias,
  tsExpr, resultAlias?)`, the ONE shared LEFT JOIN LATERAL against
  `telematics.vehicle_driver_assignments`, replacing what was 8 independently-inlined copies of
  the same predicate across the codebase (driver-day-summary.routes.ts, arrival-detection
  .service.ts, vehicle-driver-pairing.routes.ts, safety/driver-scoring/scoring.service.ts,
  fraud-detector/rules.service.ts ×2, samsara/vehicle-driver-pairing/pairing.service.ts,
  samsara/active-driver-set/recompute.service.ts — none of them touched/refactored here, this is
  the new shared definition for future/this feature's own consumers, not a repo-wide migration).
  LEFT JOIN (never INNER) so an unattributed event resolves to a NULL driver_id row, never
  dropped. Also exports `computeDriverMilesInPeriod` — per-driver confirmed miles in a period,
  shared by B-28 and B-29, NULL (never partially estimated) the moment any one assignment window
  lacks a boundary `telematics.odometer_readings` row within ±24h.
- `apps/backend/src/maintenance/fuel-driver-scorecard.service.ts` (NEW, B-28) — per-driver
  gallons/MPG/cost, gal/100mi, fills-with-no-load, 4 anomaly flags (MPG >1.5 SD below fleet mean;
  tank overflow, reusing `fraud-detector/rules.service.ts`'s own `evaluateTankOverflow`/
  `DEFAULT_TANK_CAPACITY_GAL` rather than re-deriving it; two fills <90min apart >50mi apart,
  reusing `haversineMiles`; gallons bought exceeding what the fleet's own worst real MPG could
  have consumed for the driver's actual miles). Every flag states its own evidence, never an
  accusation.
- `apps/backend/src/maintenance/driver-damage-scorecard.service.ts` (NEW, B-29) — per-driver
  damage-WO/accident-WO/tire-event/safety-accident/accident-report counts + cost + down-days, each
  ALSO expressed per 100,000 miles driven (via the same computeDriverMilesInPeriod), attributed by
  unit+event-timestamp, never by a stored driver_id column on the event row.
- `apps/backend/src/maintenance/integrity.routes.ts` (extended, B-30) — 2 new GET routes,
  `/driver-scorecard` (combined fuel+damage per driver) and `/fuel-anomalies` (flattened flag
  worklist), both period-scoped (defaults to trailing 30 days), no new routes file, no index.ts
  change (single register call already covers the whole file).
- Guard: `scripts/verify-driver-attribution-is-time-boxed.mjs` (verify-step 11959, reservation
  requested) — fails if any integrity file references `assigned_driver_id`, if a new site inlines
  the assignments-table predicate instead of importing `driverAtTimeSql`, if the shared helper
  stops being a LEFT JOIN, or (fixture-based, no live DB needed) if MPG is ever returned non-null
  for a window with an odometer gap. 4/4 mutations caught under `--selftest`.

LIVE PROOF (all 4 items the Lead asked for, run live against USMCA prod, rolled back):
1. Attribution join, one real unit (`8a842d23-8261-4c5a-bf72-bb38fa93b9f5`, 109 assignments),
   3 real dates: resolved `bd56ad0d-...` and `ba5ce08e-...` at the first two, correctly NULL at
   the third (no covering assignment that recently).
2. Unattributed bucket, last 90 days, fuel fills: **126 of 177 unattributed** — the real number,
   however ugly, not smoothed over.
3. Live driver fuel scorecard (30-day window): 22 drivers returned, each with gallons/MPG/
   gal-per-100mi/flags.
4. A real row with `mpg_null_reason: "odometer_gap"`: driver with 1 fill, 135.3 gal, $796.79 spent,
   `mpg: null` — a genuine odometer coverage gap on a real fill, not a fabricated example.

WHAT IS LEFT / FOUND ALONG THE WAY: B-29's damage scorecard currently returns 0 attributed
drivers — not a bug (proven correct by proof #1 above, which resolves real drivers elsewhere).
All 15 live work_orders (12 repair, 2 accident, 1 pm) reference 5 units with ZERO rows in
telematics.vehicle_driver_assignments, even though the fleet-wide table holds 617 rows for other
units. Filed as DAMAGE-WO-UNITS-ZERO-ASSIGNMENT-COVERAGE-2026093006, routed to CC-3 (Samsara
pairing owner) to confirm whether these 5 units are wired into the webhook at all. No frontend UI
wired to the 2 new routes (out of scope — the Lead's own proof requirements are all backend/data).

— CC-2

---
## 2026-09-30 — ROUND 299 REPORT (L-3, the 52 fuel rows)

JOB ID: L-3 (ROUND 299, "THE LINKAGE LAW")

WHAT I CHANGED:
- `apps/backend/src/maintenance/driver-attribution.ts` — added `unitAtTimeSql(driverAlias,
  tsExpr)`, the mirror of B-27's `driverAtTimeSql`: given a driver+timestamp, resolve which unit
  he was holding (needed here since the driver is already known and the unit is the missing
  fact). Same LEFT JOIN LATERAL, same boundary condition, same file — per your "do not write a
  second resolver" instruction. Guard updated (`verify-driver-attribution-is-time-boxed.mjs`) to
  check both functions for the LEFT JOIN invariant, not just the original.
- `scripts/ops/2026-09-30-cc2-l3-repair-52-fuel-unit-ids.ts` (NEW, built not applied) — resolves
  each of the 52 via both `mdata.loads.assigned_unit_id` and `unitAtTimeSql`, reports the
  breakdown, names any disagreement or unresolved row, and (only under `--apply`, gated by
  `verify-owner-authorization.mjs`, not run) writes the resolved unit_id.

RESULT: **52 of 52 resolve. 0 disagreements. 0 unresolved.** 12 of 52 corroborated by both
signals, agreeing exactly everywhere they're both present. The other 40 resolve via
`assigned_unit_id` only — the driver simply has no covering assignment-table window at that exact
transaction timestamp (a coverage gap, not a conflict). Nobody needs to be named as unresolved
per your own instruction, because nobody is.

NOT WRITTEN: I did not run `--apply`. The standing owner freeze bars "backfills... for any
reason, including proof" and its own CC-2-specific line says "no production writes at all...
Reading only" — last reconfirmed to me in ROUND 296 ("the freeze on seat money writes HOLDS for
you. Report only"). ROUND 299 doesn't explicitly lift it, so I read L-3's own "report how many...
resolve" framing as the deliverable for now rather than assuming the write is cleared. Filed on
the board as L3-52-FUEL-TXNS-NO-UNIT-RESOLUTION-2026093008, routed back to you/the owner for an
explicit call: is this specific, double-verified backfill inside the freeze or outside it. If
cleared, the script is ready — `--apply` writes exactly these 52 rows, nothing else, each
traceable to its own source signal.

— CC-2

---
## 2026-09-30 — L-3 CLOSED (AUTH-178 executed)

JOB ID: L-3 (ROUND 299) — closing the loop on the earlier report-only entry.

The owner reviewed the dry-run report and ordered, verbatim: "write the 52 fuel unit ids i
authorize it, so do it." Issued AUTH-178 (docs/bus/OWNER-AUTHORIZATIONS.md), merged to main,
verified OPEN via verify-owner-authorization.mjs, then ran
`scripts/ops/2026-09-30-cc2-l3-repair-52-fuel-unit-ids.ts --apply`.

RESULT: 52 rows updated — same 12-both-agree / 40-load-only / 0-disagree / 0-unresolved breakdown
as the dry run, no drift. Independently re-verified post-commit: 0 rows remain matching the
original gap predicate. **177 of 177 live USMCA fuel transactions now carry a unit_id.**
AUTH-178 marked CONSUMED with the full execution block.

L-3 is closed. L-1 (the linkage guard) and L-2 (the going-forward constraint) remain CC-1's.

— CC-2

---
## 2026-09-30 — ACK ROUND 300

ACK 2026-09-30 · CC-2 · read ROUND 300 standing queue · L-3 ruling confirmed correct ("HOLD...
the ruling is with the owner") — the owner's own direct authorization landed right after (AUTH-178,
CONSUMED, 52/52 written, 177/177 fuel txns now carry a unit) — no conflict, the ruling path worked
exactly as intended. Starting B-31 (A/R overstatement trace), top of the queue. Working top to
bottom, one PR + guard + proof per item, ACKing each as it lands, not waiting for a new order.

— CC-2

---
## 2026-09-30 — B-31 REPORT (A/R overstatement trace, measure only)

JOB ID: B-31 (ROUND 300)

FOUND: the chain breaks at the FIRST link, not the last. Faro's debtor-receipts (money Faro
collected on the carrier's behalf) has NO ingestion path anywhere — searched the whole schema for
receipt/debtor/collection/faro naming; `factor.faro_daily_imports`/`factor.faro_invoice_lines`
are both advance/purchase-side only, and the latter has 0 rows for USMCA.

Exactly 7 of 110 live invoices carry any payment, totaling **$15,507.60 to the cent** — matches
your own "collected" figure exactly — but all 7 are `payment_source_kind='manual'`, hand-entered
by an office user, unrelated to any Faro feed. The link downstream of that (payment_applications
-> invoice.amount_paid_cents) is provably clean: 0 of 110 invoices mismatch.

Named per your order:
- CORE's short pay IS correct: invoice 13521, $3,500 billed, $3,250 paid, $250 still open,
  status='partial'. Not silently written off. No fix needed here.
- DARDINI's two named short pays are not in the system at all — invoices 13523 ($3,600) and
  13529 ($3,900), both $0 paid. Also found: two DIFFERENT DARDINI customer records exist
  ("DARDINI LLC" / "DLS Dardini Logistics Services") — flagged, not chased further, out of
  scope here.
- The -UC- unapplied pair: zero matches anywhere (reference/notes/display_id), zero nonzero
  unapplied amounts in the whole table. External-only, like DARDINI's, never imported.

GUARD: scripts/verify-invoice-amount-paid-matches-applications.mjs (verify-step 11963,
reservation requested) — locks the one link in this chain that's provably clean today, so a
future regression there isn't mistaken for a repeat of this same Faro-import gap. LIVE PASS,
110 invoices, 0 mismatches. --selftest 1/1 mutation caught.

NOT WRITTEN: measure only, per the order. Filed on the board as
AR-OVERSTATED-CHAIN-BREAKS-AT-FARO-RECEIPT-NEVER-BECOMES-PAYMENT-2026093009, routed to you for
the real decision (build a Faro-receipts ingestion path, or keep manual entry and close the
~$12,500 gap by hand).

NEXT: B-32 (the diesel card / Relay Fuel Wallet balances).

— CC-2

---
## 2026-09-30 — B-32 REPORT (diesel card balances, measure only)

JOB ID: B-32 (ROUND 300)

FOUND: both GL accounts are real (Dreamline -$141,197.23/842 postings, Relay -$32,324.02/117
postings) but close-not-exact to your /banking figures (~$970 / ~$402 gaps, not chased further).
`banking.bank_accounts` is completely empty for USMCA — neither label has a formal bank-account
row; /banking must render these straight off catalogs.accounts + GL.

Neither balance is traceable to individual purchases:
- Dreamline: zero sub-ledger rows anywhere. No fuel.fuel_transactions rows for this vendor, no
  dedicated Dreamline table in the schema at all. The whole $141K is raw journal postings, no
  per-fill detail.
- Relay: a real integration table exists (integrations.relay_fuel_transactions, 119 rows) — but
  0 of the 75 rows flagged posted_to_gl=true have a traceable JE via the standard
  source_transaction_type='fuel_event' linkage every other fuel JE uses. Either the flag is wrong
  or there's a different linkage I didn't find — not resolved here.

NOT CHASED: the "cash on hand -$21,042.31 across 8 real accounts" figure — didn't find the right
query in the time available, naming it as an open gap rather than guessing.

GUARD: scripts/verify-fuel-card-gl-subledger-traceability.mjs (verify-step 11967, reserved via
#23514) — a ratchet, not a pass/fail on the existing gap (which is already at rock bottom):
measures both accounts' sub-ledger traceability and fails only if it gets WORSE than today.
LIVE PASS, --selftest 1/1 mutation caught.

NOT ADJUSTED: measure only, per the order. Filed on the board as
FUEL-CARD-GL-BALANCES-UNTRACEABLE-TO-SUBLEDGER-2026093010.

NEXT: B-33 (attribute the existing integrity engine findings through driverAtTimeSql).

— CC-2

---
## 2026-09-30 — B-33 REPORT (integrity findings attribution)

JOB ID: B-33 (ROUND 300)

Attributed all 116 live safety.integrity_findings rows through driverAtTimeSql — no second
resolver, no new table, safety.*'s own engine untouched.

RESULT: 46 of 116 resolve (39.7%) — orphan_entry 20/46, orphan_exit 22/46, expected_missing 4/24.
The other 70 have no covering assignment window at that unit+time — the same honest coverage
gap already named in DAMAGE-WO-UNITS-ZERO-ASSIGNMENT-COVERAGE-2026093006 (some units genuinely
lack telemetry), not a bug in the attribution logic.

GUARD: scripts/verify-integrity-findings-attribution-rate.mjs (verify-step 11971, reserved via
#23517) — ratchets today's resolved counts per anomaly_class as a floor. LIVE PASS, --selftest
1/1 mutation caught.

NEXT: B-34 (factoring reserve / escrow tie-out).

— CC-2

---
## 2026-09-30 — B-34 REPORT (Factoring Reserve / Escrow tie-out, measure only)

JOB ID: B-34 (ROUND 300)

FOUND: Driver Escrow's real sub-ledger is exactly right — driver_finance.escrow_balances shows
14 drivers, $2,375.00 to the cent, matching your own figures exactly. But the GL side (Driver
Escrow named sub-accounts) sums to only $1,325.00 — a $1,050.00 gap between the GL and the real
sub-ledger it's supposed to mirror. The sub-ledger itself is trustworthy; the GL posting of it
isn't. Three drivers even show a negative escrow balance (Rafael -$25, Neftali -$50, Jorge Luis
Infante -$150), flagged not investigated.

Factoring Reserve also doesn't tie: GL balance $5,144.40 vs Faro's own statement total $5,208.19
— a $63.79 gap. Neither matches your stated $4,992.75 exactly either.

All the test/sample-named escrow sub-accounts in the CoA (there are ~25 of them) have zero GL
activity — that noise isn't contaminating the real number, good.

GUARD: scripts/verify-factoring-reserve-escrow-subledger-gap.mjs (verify-step 11975, reserved
via #23520) — ratchets today's measurements (both gaps, as-is) as a floor. LIVE PASS,
--selftest 1/1 mutation caught.

NOT ADJUSTED: measure only, per the order. Filed on the board as
FACTORING-RESERVE-ESCROW-SUBLEDGER-GAP-2026093012.

NEXT: B-35 (QBO connection status).

— CC-2

---
## 2026-09-30 — B-35 REPORT, ROUND 300 QUEUE COMPLETE

JOB ID: B-35 (ROUND 300)

FOUND: "Not connected" is accurate and by design, not a defect. USMCA has zero QBO connections
and zero sync runs, ever. TRANSP and TRK both have live, actively-used connections today (tokens
refreshed and used within the hour, neither revoked) — QBO sync itself is healthy, only USMCA
was never wired to it, matching the parallel-books architecture (USMCA's own ledger has been
system-of-record since 2026-01-01, no entity writes back to QBO).

WHAT BREAKS: nothing the architecture didn't already expect. One partial exception: USMCA's
chart-of-accounts mirror already holds 365 rows (a one-time clone, never kept live) —
customers/vendors were never cloned at all (0 rows each).

WHAT RECONNECTING REQUIRES: a fresh Intuit OAuth flow naming which QBO company file (realm_id)
USMCA should point at — TRANSP and TRK use two different realm_ids today, so this needs its own
decision, not made here.

WHAT NEEDS RE-SYNCING: this would be a first sync (0 historical runs) — customers/vendors need
an initial pull, the 365-row CoA clone needs reconciling against live QBO.

GUARD: scripts/verify-qbo-connection-status-honest.mjs (verify-step 11979, reserved via #23524)
— locks TRANSP/TRK's own live connections staying healthy, without treating USMCA's by-design
gap as a regression. LIVE PASS, --selftest 1/1 mutation caught.

DID NOT CONNECT ANYTHING — measure and report only, per the order.

ROUND 300 QUEUE (B-31 through B-35) is now complete. Summary:
- B-31: A/R overstatement traced — breaks at Faro-receipt-never-becomes-payment, not at the
  accounting layer (clean 0/110).
- B-32: diesel card balances measured — both real GL balances, neither traceable to a sub-ledger
  (Dreamline has none at all; Relay's own posted_to_gl flag doesn't verify).
- B-33: integrity findings attributed — 46/116 resolve through driverAtTimeSql, rest are an
  honest telemetry-coverage gap.
- B-34: Factoring Reserve / Escrow tied out — the escrow sub-ledger is exactly right ($2,375/14
  drivers, matching your figures to the cent) but the GL doesn't mirror it ($1,050 gap);
  Factoring Reserve GL vs Faro's own total also off by $63.79.
  B-35: QBO status explained — USMCA was simply never connected, by design, not broken.

5 PRs merged, 5 guards live, nothing written to money or load data anywhere in the queue. Per
B-36: re-reading the queue file now for whatever's next.

— CC-2

---
## 2026-09-30 — ACK ROUND 301, B-31 UPDATED (row-level proof)

ACK 2026-09-30 · CC-2 · read ROUND 301 (B-31..B-37). Starting top to bottom.

JOB ID: B-31 (ROUND 301, extends the ROUND 300 finding)

Re-measured with full row-level detail, per "prove it with rows," nothing netted. 104 open
invoices sum to $366,409.12 exactly. 102 of those carry ZERO payment_applications at all
($366,071.72) — the complete named list (display_id, customer, amount) is now in the guard's own
live output, not summarized away. The other 2 have a partial application and remain correctly
open (CORE's $250 short-pay).

I still cannot name which of the 102 correspond to the $28,125.00 Faro says it collected in
September — that data doesn't exist in this database anywhere (re-confirmed:
factor.faro_daily_imports.raw_payload is a header object, not a line-item array). Naming a
correspondence without the actual Faro rows would be exactly the netting the order forbids, so I
didn't guess. Extended the existing guard (verify-step 11963, not a new claim) to print the full
list and ratchet its count.

GUARD: scripts/verify-invoice-amount-paid-matches-applications.mjs — same verify-step 11963,
extended (not re-claimed). LIVE PASS, --selftest 2/2 mutations caught.

NEXT: B-32 (the bank-feed matched side) — reading the owner's window-cascade ruling first, as
ordered.

— CC-2

## ROUND 301 B-32 — bank-feed MATCHED-side criteria (DONE)

Read the owner's window-cascade ruling verbatim from its enforcement point in code
(match.service.ts's own comment above MATCH_WINDOW_STEPS — the standalone file named in the
order, 09-23-2026-OWNER-DECISION-BANK-MATCH-WINDOW-DATE-CASCADE.md, does not exist under that
literal name anywhere in the repo; confirmed via find + git log --all --grep). Did not re-decide
it. Did not touch match.service.ts or apps/frontend — CC-1's reconciliation engine and Cursor's
UI stayed untouched, per the stated lane boundary.

Found, mid-task, that CC-1 had already merged A-27's real tri-state MATCHED extension
(banking.reconciliation_match_tristate(), migration 202615010000, commit 5803c71385) — not yet
deployed to prod. My job, "own the bank-feed side of MATCHED," became auditing the CRITERIA that
make an existing banking.reconciliation_matches row a true "same event" claim: account/entity,
stable transaction key, and (since CC-1's tri-state only handles single-row amount comparison)
the split-match sum invariant for the many-to-one funding-batch case that already exists live.

Built + shipped scripts/verify-steps/11983-verify-bank-match-criteria-integrity.mjs (claim-reserved
on its own branch first, per Rule 25/37). Live USMCA result: 0 cross-entity matches (ratchet floor
0, forever); 12 active split-match groups (one bank deposit funding 2-7 factoring_advance rows),
every one sums EXACTLY to its bank transaction's amount — real funding batches, not errors; 7
active matches (CSV-imported Loves fuel rows) carry no external stable key (no plaid_transaction_id,
no dedup_hash) — a real bank-feed-side gap, reported and ratcheted, not fixed here (fixing CSV
ingestion to populate a stable key is a separate, larger task, not silently patched in a guard).

Filed RECON-TRISTATE-SPLIT-MATCH-BLIND-SPOT-2026093014 to GUARD-WORKORDERS for CC-1: their new
tristate function picks only the single most-recent match row per bank transaction, so once it
deploys it will misclassify all 12 of today's correct split-matches as matched_with_difference —
a false-variance flag on a provably-correct funding batch. Did not patch their function myself
(their file, their lane) — named the exact fix needed and cited the live proof.

NEXT: B-33 (diesel card / fuel wallet — Relay's 76 uncategorized rows, a population distinct from
AUTH-178's already-fixed 52/177 fuel-unit-id rows; fresh dry run required, no reuse of AUTH-178
logic without one).

— CC-2

## ROUND 301 B-33 — Dreamline + Relay uncategorized populations (DONE)

Confirmed the Lead's own totals exactly on live USMCA data: Dreamline (banking.bank_accounts
"Dreamline Diesel Card") 397/397 bank_transactions uncategorized, $140,226.34; Relay ("Relay
Fuel Wallet") 76/76 uncategorized, $32,726.45. Neither is fuel.fuel_transactions (AUTH-178's
table, already clean 177/177) — they are two separate banking.bank_accounts whose own
bank_transactions rows carry no category/GL/unit.

Named plainly why the two populations differ, per the order:

- Dreamline: 0 of 397 link to ANY fuel-detail source table (no Dreamline-branded rows exist in
  integrations.relay_fuel_transactions or fuel.fuel_transactions, whose only vendors are
  LOVES/PILOT). Pure ingestion gap -- there is no card-swipe/fuel-detail import for Dreamline
  in this schema at all, so there is nothing for a unit-resolution query to join against.
  AUTH-178's logic has no table to run against here.

- Relay: DOES have its own fuel-detail feed (integrations.relay_fuel_transactions). Of the 76,
  69 ($31,438.15) link to it; of those, 68 ($30,753.80) already carry a resolvable
  matched_unit_id on the linked row -- the unit is already known, just never copied to
  bank_transactions.categorization_unit_id. That's a WIRING gap, not a data gap. Only 8 rows
  total ($1,972.65 -- 7 unlinked + 1 linked-but-unit-null) genuinely have no unit resolvable by
  any path. Relay's TRUE no-unit-resolves population is 8/$1,972.65, not the cited $20,942.94 --
  named the discrepancy plainly rather than forcing a match; did not re-run AUTH-178 logic
  against either population, per the order.

Shipped scripts/verify-steps/11987-verify-fuel-card-unit-resolution-populations.mjs
(claim-reserved first, PR #23563), ratcheting all six figures above as ceilings.

NEXT: B-34 (attribute the 116 existing safety.integrity_findings to drivers via
driverAtTimeSql -- checking first whether ROUND 300's guard 11971 already satisfies ROUND
301's exact wording before building anything new).

— CC-2

## ROUND 301 B-34 — attribute the 116 integrity_findings (ALREADY DONE, reconfirmed)

Re-read B-34 against what ROUND 300's B-33 already shipped (scripts/verify-steps/
11971-verify-integrity-findings-attribution-rate.mjs, merged). B-34's exact wording --
"116 existing rows, written by a cron, DO NOT BUILD A SECOND INTEGRITY ENGINE, attribute with
driverAtTimeSql, never assigned_driver_id" -- is already fully satisfied: the guard joins
safety.integrity_findings (still 116 live rows, unchanged) through driverAtTimeSql on
unit_id+occurred_at (no assigned_driver_id anywhere), reports resolved-vs-total per
anomaly_class, and ratchets the floor. Re-ran it live just now: same result as ROUND 300
(expected_missing 4/24, orphan_entry 20/46, orphan_exit 22/46). safety.integrity_findings has
no driver_id column to persist into (confirmed via information_schema) and the order forbids
rebuilding safety's rules engine, so "attribute" here is correctly a read-side join, not a
schema change -- exactly what 11971 already does. No new PR needed; closing this item as
already-done rather than manufacturing duplicate work.

NEXT: B-35 (the two virtual ledgers -- prove the escrow-never-books-to-expense invariant with
a query, then name the real account that should back each ledger).

— CC-2

## ROUND 301 B-35 — escrow/factoring-reserve never books to expense (DONE)

Proved, with two independent queries each, that neither virtual ledger ever posts to an
Expense-type account in USMCA: (1) every source_transaction_type='escrow_account' posting hits
Asset (16, $500.00) or Liability (16, $500.00) only, zero Expense; (2) broader net -- ANY
posting anywhere with "escrow" in its memo/description, joined to an Expense-type account --
zero rows, catching a mis-tagged posting that check (1) alone would miss. Same two-check
pattern for factoring reserve: all 344 live postings are Asset-type, zero Expense.

Named the real backing account for each, as ordered: Driver Escrow Pool ->
"Driver Escrow - Held in Trust" (catalogs.accounts 2100, Liability, id
0dc63b15-3407-4414-8efe-38d082a9f29f), parent of 44 correctly-Liability-typed per-driver
2100-00-NNN sub-accounts. Factoring Reserve -> "Factoring Reserves" (1230, Asset, id
165cc317-5c8b-4296-8aab-f5101f4a6815). Both already correctly typed -- the gap named in
FACTORING-RESERVE-ESCROW-SUBLEDGER-GAP-2026093012 (GL total vs sub-ledger/Faro total) is a
posting-completeness/timing gap, not a wrong-account-type problem. (Checked a possible
account_number collision on 2100/1230 first -- each exists twice in catalogs.accounts, but the
second instance of each belongs to a different operating_company_id, ordinary multi-tenant CoA
shape, not a real duplicate.)

Shipped scripts/verify-steps/11991-verify-escrow-factoring-reserve-never-books-expense.mjs
(claim-reserved first, PR #23572) as a HARD invariant (not a ratchet) -- FAILS if any future
posting, tagged or mis-tagged, ever reaches an Expense account for either ledger, or if either
named backing account is ever retyped away from Liability/Asset.

NEXT: B-36 (QBO not connected, last sync never -- report what connecting would push/overwrite
today, without connecting).

— CC-2

## ROUND 301 B-36 — QBO connect push/overwrite report (DONE, did not connect)

Did not connect. Measured what connecting would do, precisely:

PUSH: confirmed at the per-entity override row (not the global default) -- USMCA has an
EXPLICIT lib.feature_flag_overrides row for both QBO_JE_PUSH_ENABLED and QBO_ENTITY_PUSH_ENABLED,
both enabled=false, set 2026-08-16. Connecting alone pushes ZERO records; push requires a
separate, explicit owner action to flip those flags first. If ever flipped, it would be a FULL
initial push, not incremental: 0 of 1,238 customers and 0 of 622 vendors currently carry a
qbo_customer_id/qbo_vendor_id link, alongside 170 accounts / 110 invoices / 93 bills.

OVERWRITE: mdata.qbo_accounts already holds 365 rows from a one-time clone that was never kept
live -- a first CoA pull would need to reconcile against this stale mirror, and against WHICH
QBO company file (realm_id is an undecided question -- TRANSP and TRK already use two different
realm_ids, so USMCA's own is not merely unset, it's undecided). mdata.qbo_customers/vendors/
invoices/bills mirrors are all empty (0 each) -- a first pull there is pure addition, no
overwrite risk.

Shipped scripts/verify-steps/11995-verify-qbo-usmca-connect-push-overwrite-report.mjs
(claim-reserved first, PR #23575), report-only, ratcheting the push-override-off state and
candidate counts so a silent flag flip or connection attempt is caught.

NEXT: B-37 (re-read docs/bus/2026-09-30-LEAD-ROUND-301-CC-2-STANDING-QUEUE.md once 1-6 are
shipped, for the next queue).

— CC-2

## ROUND 303 — owner scope change ACK, money work stopped

Read docs/bus/NOW-CC-2.md and /Users/jorgemunoz/Downloads/09-30-2026-ALL-SEATS-OWNER-SCOPE-CHANGE-MONEY-STOPS.md
per the explicit instruction to read the scope-change file first. Owner, verbatim: "No body is
supposed to be working on money only creating engines and visual changes and upgrades. To
maintenance and dispatch customers and vendors and driver profiles modules."

Stopping here, not reverting: ROUND 301's B-32 (bank-feed MATCHED-side criteria, PR #23559),
B-33 (Dreamline/Relay uncategorized populations, PR #23566), B-35 (escrow/factoring-reserve
expense proof, PR #23573), B-36 (QBO connect push/overwrite report, PR #23576) are all already
merged before this scope change landed -- per the order, "nothing already merged gets
reverted," so those stay as shipped findings/guards. B-34 was closed as already-satisfied by
ROUND 300 work, no new commit. Not advancing any of these further, and not starting anything
new in the paused list (reconciliation matching, A/R, escrow/factoring GL, bank categorization,
QBO connection, banking screens, settlements/driver-pay posting).

Moving to ROUND 303's B-43 (finish the Integrity Engine -- a driver-profile/maintenance engine,
explicitly allowed under the new scope) and B-44 (driver complaints, driver-profile module).

— CC-2

## ROUND 303 B-43 item 1 — damage scorecard re-measured, honest zero confirmed (DONE)

Re-measured against the REAL numbers, not the cited ones, by RUNNING the live service
(computeDriverDamageScorecard, B-29) for all of 2026 on USMCA, not reconstructing its SQL by
hand: it returns 0 rows, confirmed empirically.

Corrected the cited "16 REAL units" to the real count: 14 units carry actual
telematics.vehicle_driver_assignments coverage (T147, T148, T152, T156, T163, T164, T168, T170,
T171, T173, T174, T175, T176, T177). Named why the scorecard is empty, with full rows, not a
hand-wave: ALL 20 live damage-adjacent events in the whole system fall outside that set of 14 --
the 15 live work_orders sit on exactly 5 units (T120, T149, T150, T151, USMCA-001), every one
with ZERO driver-assignment coverage (matches the order's own claim exactly); the 1 tire_event
is tagged to a unit that is BOTH is_sample_data=true AND owned by a completely different
operating_company_id (a cross-tenant test fixture, despite its own row claiming
operating_company_id=USMCA); the 1 safety.accidents row and 1 of 3 safety.accident_reports rows
carry unit_id=NULL; the other 2 accident_reports sit on 2 of the same 5 untracked units.

This is a genuine data-coverage gap, not a code defect -- driver-attribution.ts and the
aggregation SQL are correct; B-28's "NULL, never estimated" discipline holds (the function
returns an empty array rather than fabricating attribution). Shipped
scripts/verify-steps/11999-verify-damage-scorecard-honest-zero.mjs (claim-reserved first),
locking this honest-zero result and ratcheting the 14-unit coverage floor.

NEXT: B-43 item 2 (attribute the 46 of 116 integrity_findings that DO resolve via
driverAtTimeSql, report the other 70 as a coverage gap -- building on the already-shipped
guard 11971's own measurement).

— CC-2

## ROUND 305 B-46 — THE FUEL SIDE OF INTEGRITY HAS NO GALLONS, ANSWERED FROM THE API (DONE)

Answered from raw_payload (what Relay's API actually sent us, verbatim — ground truth, not
reasoning), live USMCA:

Relay's response shape: `products` carries NO fuel/gallon data on any row (the only 2 of 119
non-empty `products` line items are CAT Scales weigh-station fees, zero fuel_items on both --
correctly non-fuel). `fuel_items` (a SEPARATE field Relay's own response includes) carries REAL
volume data on 117 of 119 rows. Our own request (fetchAllRelayFuelTransactions) sends no
field-selection param at all -- it isn't omitting anything; this is Relay's default response
shape. Our ingest (upsertRelayFuelTransaction) already correctly parses and stores this into
integrations.relay_fuel_transaction_lines.volume. The premise "products is where gallons live"
does not hold against the real API response -- gallons live in fuel_items, Relay already sends
it, and we already capture it.

The 52 zero/null-gallon fuel.fuel_transactions rows are NOT Relay rows at all. Traced via
source_row_hash: all 52 carry the literal prefix "alwaystrack-def:", written by
scripts/feed/close-faro-day.mjs, which hardcodes gallons=0 for every DEF line item extracted
from a Faro feed record (Faro's own DEF line carries only a dollar amount, no volume figure --
a structurally separate, honest gap, unrelated to Relay). Confirmed exhaustively: every one of
the OTHER 125 fuel.fuel_transactions rows has gallons > 0; every one of the 52
"alwaystrack-def:"-hashed rows has gallons = 0 -- an exact, airtight complement.

relay-fuel-canonical-bridge.ts's bridgeRelayFuelToCanonical() already computes real gallons
from fuel_items correctly, but is dead code -- called from nowhere. A ROUND 43 owner ruling
deliberately cut the Relay->fuel.fuel_transactions bridge after it manufactured 39 confirmed
duplicate fuel rows against Dreamline's own statement. Relay's gallons are captured in our own
DB and simply never promoted further, by design.

Webhook: the original blueprint (IH35_MASTER_BLUEPRINT_v3_FULL.md) specifies Relay webhook
ingestion as the intended method. What's built instead is a once-daily polling cron
(relay-fuel-ingest.cron.ts) -- no webhook receiver route exists anywhere in the backend. This
architecture divergence (poll instead of the spec'd webhook) is the code-confirmed cause of the
multi-day lag. UNVERIFIED (cannot check from this repo): whether Relay's live API still offers
a webhook registration option today -- that needs Relay's own current API docs/account, outside
this codebase; not guessed at.

Agrees with the Lead's own conclusion: Relay is not a timely source and should not be the basis
of same-day fuel-theft detection. Shipped
scripts/verify-steps/12003-verify-relay-fuel-gallons-root-cause.mjs (claim-reserved first, PR
#23587), locking all of the above as hard invariants (not ratchets where the population shape
itself is the point) so a future silent regression in either population's character is caught.

NEXT: B-47 (build the fuel-integrity component so it refuses to flag a driver on a single
signal, now that stop-odometer-capture.service.ts gives a real second, independent miles
signal).

— CC-2

## ROUND 305 B-47 — fuel integrity component, refuses to flag on a single signal (DONE)

Built apps/backend/src/maintenance/fuel-integrity.service.ts + GET
/api/v1/maintenance/integrity/fuel-integrity. Extends B-27/B-28 and the Lead's stop-odometer
engine; no second engine, no data written, no apps/frontend.

Four signals per driver, each carrying its sources, its arithmetic with real numbers, its reason,
and row-level evidence: mpg_odometer_snapshot (B-28 unchanged), mpg_stop_odometer (same card
gallons / stop-odometer miles, attributed only when the same driver held the truck at both ends of
a segment; handovers and backwards odometers excluded and counted; withheld under 80% coverage of
assigned hours), relay_fill_presence (each Relay fill's real pump time + station lat/lng vs the
truck's own GPS: stopped within 500 m inside +/-60 min; no GPS = unverifiable, never counted
against the driver; anomalous at >=2 absent), samsara_fuel_energy (CC-3 T-50 — reported
unavailable, never faked).

The refusal: "finding" requires two ANOMALOUS signals with DISJOINT sources. The two MPG signals
share the card gallons, so together they are still only a suspicion.

Live, USMCA, 61 days: 36 drivers — 0 finding, 1 suspicion, 18 clear, 17 insufficient_data. The one
suspicion is the refusal working on real data: B-28's snapshot MPG reads below the fleet floor,
the independent stop-odometer miles put the same driver at normal MPG. Measured honestly: the 125
diesel card rows carry no location and 122 are date-only, so presence can only come from Relay;
of 119 Relay fills, 40 lack a unit or location and 34 fall where no driver was assigned at pump
time — both counted in the payload, never dropped.

Guard 12007 (claim-reserved, PR #23598): selftest proves the refusal + the attribution mirror;
live mode fails on any finding without two independent anomalous signals or any signal with empty
arithmetic. On a database without USMCA (CI's fresh DB) it runs selftest only and says so.

CI FINDING, not mine to fix: main's CI is red independent of this work — ih35_ci_readonly password
rejected (22 live guards), and fresh-DB migration replay fails on pm_intervals_operating_company_id_fkey.

NEXT: make my 11 earlier production-data guards CI-fresh-DB safe the same way (my own lane), then B-48.

— CC-2

## ROUND 305 B-49 — integrity findings: attribute what can be placed, state the rest (DONE)

Built apps/backend/src/maintenance/integrity-findings-attribution.service.ts + GET
/api/v1/maintenance/integrity/findings (finding -> driver) and
/findings/driver/:driver_id (driver -> findings). Reads safety.integrity_findings as the cron
wrote it; no second findings table, no write, no schema change. Driver comes ONLY from
driverAtTimeSql at occurred_at.

Live, USMCA: 116 findings — 46 attributed, 70 stated as a gap (matches the order's 46/70). The 70,
by named reason: 2 no unit on the finding; 13 on units never assigned a driver (T149, T150, T166 —
real trucks gone dark per live-fleet.ts — plus USMCA-001 placeholder and TEST-U01); 24 where the
covering assignment window records NO driver (truck in use, nobody signed in — not attributed, and
worth an ops look on its own); 31 where no window covers the moment. Every gap row carries its
unit's live-fleet class so a dark real truck reads differently from a placeholder.

Measured on the way: 52 of 620 USMCA assignment windows have driver_id NULL. A naive "a window
covers it" count reads 70 attributable — wrong, because 24 of those windows say nobody was driving.

Guard 12011: selftest 5/5 (no attribution without a window driver; every gap reason); live
cross-checks every attributed row against an independent hand-written window recomputation and
that the summary adds up. Does not freeze 46/70 — the split moves with assignment coverage.

NEXT: B-48 (damage scorecard against live-fleet.ts), then B-50, B-51.

— CC-2

## ROUND 305 B-48 — damage scorecard against the MEASURED live fleet (DONE)

New apps/backend/src/maintenance/damage-event-attribution.service.ts + GET
/api/v1/maintenance/integrity/damage-events: every work order (repair/accident), tire event, safety
accident and accident report, one row each, with its driver (assignment window at event time) or a
named gap reason, plus where it sits in live-fleet.ts's measured classes.

Live, USMCA, all-time: fleet measured (no hardcoded size) = 16 reporting, 23 REAL TRUCKS DARK, 3
no telemetry ever, 1 sample. 19 damage events, 0 attributable: 10 on dark real trucks (T149, T150,
T151, T120 — not test data, never were), 6 on the USMCA-001 placeholder, 1 tire event on a unit
outside USMCA's fleet, 2 with no unit. The damage scorecard has genuinely never touched a reporting
truck; the scorecard's empty driver list matches the event-level view exactly.

Corrected my own guard 11999: removed the hardcoded 14-unit floor and the "coder test artifact"
wording I had repeated. It now reads the fleet from live-fleet.ts, and fails if any event lacks
a driver or reason, if a real truck is ever classed sample, or if scorecard and events disagree.
Also fixed B-28/B-29: concurrent queries on one pg client (Promise.all) replaced with sequential
reads — deprecated and able to interleave.

B-51 STATUS: safety.complaints ALREADY EXISTS (with catalogs.complaint_types and routes), so it is
extended, not rebuilt. It carries driver (respondent_driver_id), source (complainant_type +
customer/user/driver/external), category, date, detail and recorded-by — but NO load_id and NO
unit_id, so load -> complaints linkage is impossible today. Adding those two columns is a migration,
and verify-migration-lane-band.mjs fails closed on any CC-2 branch adding one; its only crossing is
an owner-authorized exact-branch/exact-file one-off. I am not authorizing myself in CC-1's guard.
Building the complaints component on the existing columns next; the two-column migration needs the
owner's one-off authorization (or CC-1) — named here, not hidden.

— CC-2

## ROUND 305 B-50 + B-51 — evidence on every flag; complaints component; composed profile (DONE)

B-50: every B-28 fuel flag now carries period_start/period_end, the arithmetic in words with the
real numbers, and evidence_fills (fill id, date, gallons, cost, unit number, vendor, location).
Live: 10 fuel flags since 2026-07-01, every one with all three.

B-51: safety.complaints already existed — extended, not rebuilt. A complaint counts against a
driver only when it is linked to a real driver (respondent_driver_id, or legacy respondent_id when
respondent_type = 'driver') AND names who recorded it. Live: 3 complaints against drivers, 1
counted (failure to answer dispatch calls), 2 excluded — both coder TEST rows with no recorder.

Composed profile: GET /api/v1/maintenance/integrity/driver-profiles and /driver-profiles/:driver_id
— fuel, damage, accidents, tire_events, geofence_findings, complaints, each with status, arithmetic,
basis and evidence. No invented weights: the score is a checkable count (findings / suspicions /
observed / not measurable). Only fuel has an owner-defined finding rule. Live: 43 profiles.

Filed on the board (not fixed — not mine to write): COMPLAINTS-CODER-TEST-ROWS-LIVE-IN-USMCA-2026100101
(3 test complaints live in USMCA, need a void by an authorized seat) and
COMPLAINTS-NO-LOAD-UNIT-LINK-AND-OWNER-CATEGORIES-MISSING-2026100102 (no load_id/unit_id columns;
no lateness / refused-dispatch / damage categories; the migration is lane-barred for CC-2).

Guard 12015: every flag has evidence + period; every component has arithmetic; no uncounted-
recorder complaint ever counted; score recomputes from components.

ROUND 305 status: B-46, B-47, B-48, B-49, B-50, B-51 shipped. B-52 = re-read the file.

— CC-2

## ROUND 306 — ACK: CC-2 | ACK R306 | E-19 | GO.  E-19, E-20, E-21, E-22 (DONE in one PR)

E-19: CC-3's T-45 had already built the one fuel-purchase predicate (fuel/fuel-purchase-eligibility.ts)
and its guard — not rebuilt. Its guard was never registered (no verify-step ran it); 12019 now runs
it. My fuel scorecard now uses that predicate: DEF charges, gallon-less rows and import-stamped
batches no longer enter MPG or any flag; they are counted per driver by reason. The 52 are DEF
charges from scripts/feed/close-faro-day.mjs (source has no gallons) — not Relay rows. "Re-import the
52" from Relay is not possible: Relay never had them. Re-dating them from their settlement lines is
a data write and needs owner AUTH (CC-3 named the same).

E-20: root cause, from the audit trail + Render logs, not the flag theory: the TRANSPORTATION Relay
key is the one that carries the USMCA trucks' fills, and its flag was switched OFF 2026-09-28 04:32
UTC from the owner's account. The USMCA key returns raw_rows=0 on every tick. integration_sync_log
had ZERO Relay rows ever — the tick was invisible there. Request fields: answered in B-46 — no field
selection is sent; gallons arrive in fuel_items (117/119), products only carries CAT Scales fees.
Engine fixes: (1) gap-aware window — resumes from the last covered day, re-reads a 3-day overlap for
late-published fills, capped at 30 days, chunked like the backfill; turning the TRANSP flag back on
recovers 09-27 onward automatically; (2) single runner — Render runs 2 instances and both pulled
every company daily; the tick now claims under an advisory lock; (3) every tick writes
integration_sync_log (start, finish, window, reason, rows). Board: RELAY-TRANSPORTATION-FLAG-SWITCHED-OFF-2026-09-28 (owner action).

E-21: fuel.fraud_alerts had ZERO rows ever in every company — the worker is default-OFF and its
"successful runs" were boot-time disabled records. Now: no timer; runs once on fuel-ingest
completion; scans only real purchases; pump-time rules refused on date-only rows; a FINDING needs
two rules with independent evidence (GPS-mismatch + inactive-truck both read GPS = one signal);
one rule = 'warn' suspicion, never a critical notification. Dry run on live USMCA (no write, no
dispatch): 176 rows, 52 DEF skipped, 124 purchases → 0 findings, 25 suspicions (tank overflow),
99 clear; 33 off-duty/inactive hits refused as date-only — the old code would have raised them.
Still behind ENABLE_FUEL_FRAUD_DETECTOR_WORKER (default OFF) — enabling writes alerts; owner's call.

E-22: fuel<->GPS match no longer hourly over every company; runs from the same ingest hook (Loves
import daily = also the sweep for manual rows; statement upload for that company). Card->unit
registry (fuel.fuel_card_assignments) is an "after DONE" addition and needs a migration —
lane-barred for CC-2; named, not attempted.

Also measured: the IH35-TMS backend service has autoDeploy=no — merged code is live only after a
manual deploy. Every engine merged today waits on that.

Guard 12019: selftest 11/11, static wiring, live (eligibility guard, no critical alert without a
finding, Relay flag/coverage per company).

NEXT: E-26/E-27/E-28 are the ROUND 305 work already merged (#23607, #23610); re-verifying them
against the registry wording next.

— CC-2

ACK NOW-CC-2 2026-10-01 b68da3b1a7

## TO CC-1 (NOW-CC-1 order 5) — the three coder test complaints live in USMCA, for your void

safety.complaints, operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80, all voided_at IS NULL:
  5e691a6a-a3bc-48b8-935f-8144be577509  "TEST DATA complaint keep"                     HARASSMENT, against a real driver (respondent_id 9f35cf21-01bb-467e-bc31-e96bb9c60dfe), created_by NULL
  9e52b358-690c-47bc-9fac-18f704f6a4bb  "TEST DATA company complaint keep ..."         SERVICE-QUALITY, against a real driver (respondent_id 88c04cf5-9e32-455c-91e5-298a9b331b10), created_by NULL
  e81cd567-92eb-412e-888a-241842ea181b  "CODEX P44 complaint type FK smoke"            type CODEX_P44_COMPLAINT, respondent_type employee
Board row: COMPLAINTS-CODER-TEST-ROWS-LIVE-IN-USMCA-2026100101. The integrity profile already
excludes the two driver ones (no recorded_by); voiding removes them from every other screen.

## E-27 addition — miles source labelled; stop-event switch built, waiting on E-03's table

telematics.unit_stop_events is not in production (to_regclass NULL) and 202615030000 is not
published on any branch I can read — so its shape is not guessed. resolveDriverMilesInPeriod()
(driver-attribution.ts) switches damage-per-100k to miles_since_previous_stop only when the table
exists AND information_schema shows operating_company_id, unit_id, stopped_at,
miles_since_previous_stop; a segment counts only when the same driver held the truck at both
stops. Until then the source stays the daily snapshot and every scorecard row and profile
arithmetic says "daily snapshot miles". Guard 11999 now fails if the label ever disagrees with
whether the table is there. If E-03's columns differ from those four, the switch stays off and
says so — tell me the real names and it is a one-line change.

## NOW-CC-2 item 3 — Fuel page read model, and E-22 actually fixed (DONE)

Found while reading what I built: the E-22 matcher placed fuel-merchant bank lines on "the truck
with a GPS fix closest in time to the row's DB insert time", never comparing with the station — its
75 USMCA "high" matches were clock coincidences (board: FUEL-GPS-MATCH-BY-CLOCK-COINCIDENCE-2026100103).
Fixed: bank lines are never placed on a truck; purchases with a station + pump time (Relay fills)
get a two-signal verdict — the card's Truck # (resolved inside the company's own fleet, as the
ingest does) vs the trucks GPS shows stopped within 500 m at pump time: match / held / proposal /
unverifiable / no_candidate. Computed on read; the bank-line batch is out of the ingest hook.

GET /api/v1/fuel/integrity-verdicts — per card row: purchase or not (shared predicate), fraud
classification on read (finding / suspicion / none), rules matched, date-only refusals, why; per
Relay fill: GPS verdict, candidate trucks with distance, why. Writes nothing. UI is Cursor's lane.

Live, USMCA since 2026-07-01: Relay 106 match, 9 held, 3 unverifiable, 1 proposal. The held ones are
real: e.g. 08-29 card T175 / T174 at the pump, 08-30 card T174 / T175 at the pump — drivers keying
each other's truck. Card rows: 52 DEF charges (not purchases), 100 none, 25 suspicion, 0 findings.
Guard 12023 (claim #23625). Tests rewritten — the old ones asserted the coincidence behaviour.

E-28 linkage waits on CC-1 order 5 (migration).

— CC-2

CC-2 | ACK ORDERS-2026-10-01 | E-27 | GO

## ORDERS-2026-10-01 row 1 (E-27) — switch corrected to E-03's published columns
The Lead's column list has no stopped_at and no operating_company_id; my #23624 switch looked for
both, so it would never have activated. Now: feature-detects unit_id, started_at,
miles_since_previous_stop, miles_note; scopes through the unit's owner/lessee company; sums
miles_since_previous_stop WHERE miles_note IS NULL, a segment counting only when driverAtTimeSql
gives the same driver at this stop and the previous one. SQL proven against the published shape
(inline row set in a read-only transaction: 9 drivers attributed). Until the table is live the
label stays "daily snapshot miles" (guard 11999 checks the label matches reality).
Row 3 (Fuel page) is #23628: per transaction the E-22 GPS verdict and the E-21 classification with
why; the 52 DEF rows come back as fuel_type def, is_purchase false, not_purchase_reason
not_motor_fuel — shown, excluded from MPG, never hidden. Endpoint for Cursor:
GET /api/v1/fuel/integrity-verdicts?operating_company_id=&period_start=&period_end=
-> { card_rows[{fuel_transaction_id, transaction_at, fuel_type, gallons, total_cost_cents,
unit_number, is_purchase, not_purchase_reason, date_only, fraud_classification, suspicion_count,
rules_matched, rules_refused_date_only, why}], relay_fills[{transaction_id, pump_time, station,
gallons, card_unit_number, candidates[{unit_number, metres, at}], verdict, why}], summary }.
Rows 2 and 4 wait (CC-1 migration; owner TRANSP flag). Next: rows 5 + 6 (pump time + IFTA state).

## ORDERS-2026-10-01 rows 5-6 — pump time + IFTA state derivation (engine DONE; storage needs CC-1)

Engine: apps/backend/src/fuel/fuel-time-derivation.service.ts. For each date-only motor-fuel row
(shared purchase predicate), the truck's own stops that Chicago day (telematics.unit_stop_events
when live — feature-detected — else dwell >= 3 min from vehicle_locations via detectStops), kept
only inside a fuel_stop geofence (its own radius). 1 fill + 1 fuel stop -> time + state (high);
n fills + 1 fuel stop -> time + state (medium); more fuel stops than can be told apart -> state
only when every fuel stop is in one state; none -> nothing, reason stated. Never touches
transaction_at or any source field. GET /api/v1/fuel/time-derivations (on read). Writer runs from
the fuel-ingest hook, FUEL_TIME_DERIVATION_ENABLED default on (own output), logged no-op until the
side table exists.

HIT RATE, live USMCA, read-only: 125 date-only rows -> 32 with a derived time, 41 with a derived
state, 73 nothing. Main miss: trucks stop at Love's 2-14 times a day (parking, showers), so one fill
cannot be pinned to one of them — not guessed. The tie-breaker is a fuel-level jump at the stop
(Samsara Fuel & Energy, CC-3 T-50 data); that is the addition after DONE.

TO CC-1 (migration, my lane cannot author it) — fuel.fuel_transaction_derivations:
  fuel_transaction_id uuid PRIMARY KEY REFERENCES fuel.fuel_transactions(id)  (no cascade; nothing deletable)
  operating_company_id uuid NOT NULL REFERENCES org.companies(id)
  transaction_at_derived timestamptz NULL
  state_derived text NULL                      (2-letter US / MX state as Samsara reports it)
  derived_from_kind text NULL CHECK (derived_from_kind IN ('unit_stop_event','vehicle_locations_dwell'))
  derived_from_ref text NULL                   (unit_stop_events.id, or "unit:start..end" for dwell)
  geofence_id uuid NULL REFERENCES geo.geofences(id)
  confidence text NULL CHECK (confidence IN ('high','medium'))
  reason text NOT NULL
  derived_at timestamptz NOT NULL DEFAULT now()
  FORCED RLS on operating_company_id (canonical predicate), GRANT SELECT/INSERT/UPDATE to ih35_app,
  audit like any engine output table. Example row: (fuel txn of T171 2026-08-18, USMCA,
  2026-08-18T15:29:55Z, 'OH', 'vehicle_locations_dwell', '<unit>:2026-08-18T15:29:55Z..', <Love's fence>,
  'high', 'one fill, one fuel stop that day ...').

TO CC-3 (T-49 IFTA): read fuel.fuel_transaction_derivations.state_derived (and
transaction_at_derived) joined on fuel_transaction_id; until the table lands, GET
/api/v1/fuel/time-derivations returns the same fields computed on read. Never the source field.

Next wiring once the table exists: E-21/E-22 read transaction_at_derived (confidence high) as the
pump time instead of refusing the row.

## Owner order 2026-10-01 — no handoff: CC-2 built its own migrations + E-28 + derived-time wiring
Owner: "fully complete and build their own engine, no handing off". Recorded as
docs/bus/2026-10-01-OWNER-ORDER-CC-2-NO-HANDOFF-BUILD-OWN-MIGRATIONS.md; numbers claimed first (#23641);
owner one-off added to verify-migration-lane-band.mjs (exact branch + exact two files).
- 202615100000: safety.complaints load_id + unit_id (FKs, indexes) + trg_complaints_same_company_links
  (another entity's load or truck is refused) + LATENESS / REFUSED-DISPATCH / DAMAGE for USMCA.
- 202615110000: fuel.fuel_transaction_derivations (forced RLS, grants, audit trigger, CHECK: a
  derived time must name its source stop). Never touches fuel.fuel_transactions.
- Complaint write path: create + owner update accept load_id / unit_id (validated same company);
  list filters ?load_id= and ?unit_id= (load page / unit page), ?driver_id= and ?customer_id= already
  existed. FOR CURSOR: GET /api/v1/safety/complaints?operating_company_id=&load_id=  |  &unit_id=  |
  &driver_id=  |  &customer_id=; POST/PATCH body fields load_id, unit_id; categories via
  catalogs.complaint_types (LATENESS, REFUSED-DISPATCH, DAMAGE, MISCONDUCT = conduct).
- Integrity profile complaints carry load_id, unit_id, customer_id (feature-detected until deploy).
- E-21 fraud detector + Fuel page evaluate a date-only row at its HIGH-confidence derived pump time
  instead of refusing it; transaction_at never changes.
Rehearsed both migrations in a rolled-back transaction on production: idempotent, categories land,
same-company load accepted / cross-company refused, sourceless derived time refused, audit trigger on.
AUTH-180: owner authorized voiding test items — 3 coder test complaints voided (#23646), AUTH CONSUMED.
Live after the Lead's next deploy (db:migrate runs pre-deploy).

## 2026-10-01 04:45Z — CC-2 | RELAY GALLONS PROOF | fraud detector ON (owner order)
Owner, verbatim (chat, 2026-10-01 ~04:27Z): "you have full permissions and authoriztions, turn it on"
— so I did not wait for the 12:00Z tick.
- PULL: Render one-off job job-dauu3k97lnhs739vc4og on srv-d7rpem7avr4c73fhp4n0 (deployed engine,
  keys stay in Render) ran runRelayFuelBackfill for TRANSP 91e0bf0a only, 2026-08-01..2026-10-01,
  status succeeded. Idempotent upsert by transaction_id; the Relay ingest posts no GL (ROUND 43).
- PROOF (Neon prod, bypass read, rolled back):
  - 95 new TRANSP Relay transactions; relay_created_at min 2026-08-03T22:28:59Z, max 2026-10-01T03:31:34Z.
  - 86 diesel lines, 7,597.40 gal, **0 zero-gallon diesel**. DEF 50 lines/303.98 gal, reefer 5/511.49, 0 zero-volume.
  - 2 rows with no fuel line are $15.25 sender-fee items, not fuel.
- FRAUD DETECTOR: ENABLE_FUEL_FRAUD_DETECTOR_WORKER=true set on the backend service. Redeployed the SAME
  commit already live (fe1421c952 = origin/main), so no new code shipped: dep-dauu4rg473hc73cm6smg.
  It runs on ingest only (Love's cron + statement upload), with E-19 eligibility and the E-21 two-signal
  cap: one signal = warn, no critical page.
- 12:00Z tick: TRANSP's last covered end is now 2026-10-01, so the daily tick resumes with its 3-day
  overlap; no gap.
- FINDING RELAY-SAME-FILL-IN-TWO-ENTITIES-2026100104 (my E-20 lane; measured, NOT fixed here):
  - Every Relay row in both entities has linked_org "IH 35 TRANSPORTATION LLC" (one Relay org).
  - 43 of the 95 new TRANSP rows carry the same transaction_id as a row already stored under USMCA,
    so the same physical fill now exists in two entities.
  - The Relay ingest posts no GL, so no money moved.
  - Anything that sums Relay rows across entities double-counts those 43, including Owner sessions,
    where RLS returns every company.
  - 7 of 95 new rows unit-matched; all 7 are non-USMCA-owned units. 0 driver-matched.
  - Needs a Lead ruling: one owning entity per Relay transaction_id (route by the matched truck's
    entity), or USMCA-only ingest.
  - I will build whichever is ruled, inside E-20.
  - Also: backfill pulled 171 vs 95 unique (window filter re-upserts the same ids; harmless, inflates
    the audit count).
- ENGINE: runRelayFuelIngestTick extracted (cron + new runner dist/sync/run-relay-fuel-ingest-tick.js),
  so the next on-demand pull uses the daily-tick path (claim + sync-log row), not the backfill.

## 2026-10-01 05:45Z — CC-2 | rows DONE + registry additions shipped (fast-merge law)
- Rows (ORDERS-2026-10-01-CC-2): all merged and live.
  - E-27 miles switch: #23631.
  - E-28 linkage, own migration: #23655, live since the 04:31Z deploy.
  - Fuel verdict page / Integrity tab: #23678.
  - Integrity report sections + complaints load/truck + reverse sections: #23685.
- Relay proof + fraud detector ON: #23679 (see 04:45Z entry).
- E-21 addition, Samsara Fuel & Energy as fuel-integrity signal 4: #23688.
  - Compares the ECU burn per driver (Samsara driver report) with the truck fuel bought for that driver
    (card gallons less reefer).
  - Anomalous only past one tank per truck driven, using the fraud detector's own tank model.
  - With an MPG signal it is a suspicion (they share card gallons); with Relay pump presence it is a finding.
  - Guard 12031.
  - Verdicts appear after the next deploy: the Samsara token decrypts only in Render, and until then the
    engine reports the feed error instead of a number.
- E-22 addition, card -> truck registry: #23695.
  - Own migration 202615140600 (CC-2 band HH 06), table fuel.fuel_card_assignments.
  - Routes: /api/v1/fuel/card-assignments (list / resolve / create / end / void; reverse via ?unit_id= / ?driver_id=).
  - The statement importer resolves a missing/unmatched unit from the card at transaction time, or states why not.
  - Notes keep only the last 4 digits of the card field.
  - Guard 12035. The screen is in progress.
- FINDING (measured): fuel.fuel_transactions.fuel_card_id is a card TYPE (DREAMLINE catalog row), not a card.
  Only 3 of 177 USMCA rows carry a card field at all.
  The registry is empty until the owner enters card -> truck assignments. That is data entry, not seeding:
  CC-2 writes none.
- Next: E-20 addition (Relay webhook, if Relay offers one). Then E-26 -> E-28 "after DONE" items are
  Cursor's Driver Profile KPI, not mine.

## 2026-10-01 05:45Z — CC-2 | money side (owner law 2026-10-01) — shipped AND live (deploy dep-dauv2igjo6nc73eoar40, 1667208f32)
- DEPLOY UNBLOCKED (#23712): every deploy failed pre-deploy because #23681's reconstructed
  202614620000 differs in bytes from what prod stamped.
  - Prod already has engine_state nullable, so it is the same change.
  - Fixed with one entry in migration-checksum-overrides.json (guard pins the bytes).
  - Deployed main: live, /api/v1/health 200.
- EXPENSE-JE-LIVE-BUT-UNPOSTED (#23702 AUTH-188 + #23703 root fix):
  - 94 USMCA expenses ($3,744.13: 5 fuel docs + 89 settlement-feed) carried a live JE while
    posting_status=unposted, so a void would have skipped the reversal.
  - Repaired under AUTH-188 (CONSUMED, 1 audit row).
  - The fuel document writer now sets posting_status.
  - New CHECK expenses_journal_entry_implies_not_unposted.
  - LIVE: guard 12039 "536 expenses carry a JE, 0 read unposted; constraint VALIDATED".
- RETRY-HELD-EXPENSE-CRON-NEVER-SUCCEEDED (#23705):
  - The cron that posts held/draft expenses ran as an all-zero system user that does not exist;
    every run failed with forbidden_company_membership since 2026-09-29.
  - Six jobs now share lib/system-actor.ts.
  - The 11 USMCA fuel drafts ($1,515.78) post through the existing engine on its next run (06:20Z).
- FUEL-FRAUD-CONFIRM-IS-A-DEAD-END (#23710, migration 202615140800):
  - Confirm-fraud now opens or reuses the purchase's recovery in the FUEL-03 overage engine:
    pending_review with contract authority, else company_variance.
  - Approve posts Dr fuel_overage_receivable / Cr fuel expense, and the alerts become recovered.
  - LIVE: guard 12043 pass (0 alerts so far; the detector has been ON since 04:31Z).
- E-21 Samsara signal 4 LIVE (Render job job-dauv4pd9fdbs73ahefdg, read-only):
  - The feed was read; 18 drivers have ECU burn; 0 Samsara drivers unmapped.
  - Signal 4: 3 normal, 22 unavailable with reasons (15 have burn but no card gallons attributed; 7 have no 1:1 map).
  - 0 anomalies.
- E-22 card registry LIVE (guard 12035: table present, 0 assignments). Screen #23709: Fuel > Cards, plus unit/driver
  reverse sections.
- Remaining money row: Relay/fuel-card GL routing. Blocked on the Lead's ruling for
  RELAY-SAME-FILL-IN-TWO-ENTITIES-2026100104, because the same Relay fill sits in TRANSP and USMCA, so the
  owning entity of each fill must be ruled before it can route to any GL.

## 2026-10-01 06:00Z — CC-2 | linkage-law audit of my fuel lane (owner order: "total and complete linkage")
FORWARD, live USMCA (177 live fuel rows, 175 fuel expense documents):
- Every live fuel row has load, driver, unit and vendor: 177/177 each.
- 0 fuel rows disagree with their load's unit or drivers.
- 67 rows carry their load's assigned trailer.
  - 102 have no trailer, and their load never had one assigned.
  - 4 could take one from the load. Tier 1 does not require a trailer.
- Fuel expense documents: unit, driver, vendor, GL account, payment account and JE all agree with their
  fuel row (0 mismatches).
  - 35 lack an expense_load_links row.
  - The 3 on R-160 loads were relinked by AUTH-018.
- FINDING FUEL-SOURCE-VOIDED-UNDER-LIVE-EXPENSE-2026100109 (board):
  - 146 live fuel expenses ($91,492.34) sit on fuel rows that E10 R-102-C voided on 09-28.
  - The money is booked once (each expense has its own entry).
  - The operational record is gone from MPG, IFTA, fraud, integrity and the scorecards.
  - The ruling needed is reinstate-without-repost or void the documents.
REVERSE (unit / driver / load / trailer / vendor -> fuel, expenses, recoveries, alerts, Relay fills): code audit
running; any missing reverse view in my lane gets built next.

## 2026-10-01 06:35Z — CC-2 | OWNER RULING recorded + fuel-lane reverse routing
- OWNER, verbatim: "THE LOADS BELON TO TRANSPORTATION BUT USNMCA ASSUMES AND KEEPS ALL EXPENSES."
  - The R-160 loads' 24 fuel rows and their expenses stay in USMCA, linked to those trips.
  - Recorded on board row FUEL-SOURCE-VOIDED-UNDER-LIVE-EXPENSE-2026100109.
- Reverse routing built (backend, guard 12047):
  - fuel purchases list ?vendor_id=
  - fraud alerts list ?unit_id= / ?driver_id= / ?load_id= / ?vendor_id= (through the purchase)
  - fuel purchases drill to their expense document + JE, and the expense detail links back to its purchase
    and flags a voided one
  - NEW GET /api/v1/fuel/relay-fills ?unit_id= / ?driver_id= / ?unmatched=true (100 of 119 USMCA Relay
    fills have no truck or driver matched and were reachable from no hub)
  - Screens follow.

## 2026-10-01 06:25Z — CC-2 | ledger corrected at root; cron timing corrected
- EXPENSE-LEDGER-ACCOUNT-DISAGREES-WITH-LINE (ACCT-F100111):
  - 3 settlement-5781 documents posted $518.80 of reefer diesel to 5010 DEF while their lines said 5000.
    These were the only 3 of 544 posted lines.
  - Reissued under AUTH-189 (CONSUMED): 13523-27/28/29 -> 13523-30/31/32, each with load 13523's truck and driver.
  - Root fix #23735: trigger refusing a posted line's account/amount edit (migration 202615170700); guard 12051.
  - LIVE: verify-fuel-cost-posts-exactly-once PASS; 12051 544/544; 12039 539 JEs, 0 unposted; void-is-whole 0.
- Also fixed at root in #23735: the engine-status probe for E-03 named unit_stop_events.stopped_at; the column is
  started_at (verify-engine-catalog-probes-exist 22/22).
- CORRECTION: the retry-held-expense-postings cron runs "20 */6" America/Chicago = 05:20/11:20/17:20/23:20 UTC.
  - My earlier "06:20Z" was wrong.
  - The first run on the fixed system actor is 11:20Z; the 11 fuel drafts post then.

## 2026-10-01 07:15Z — CC-2 | Lead 06:45Z + 06:50Z: 146 fuel rows DONE; Faro 13625 / 13638 verified
### 146 fuel rows — DONE
- AUTH-190 (#23740) applied:
  - 146 rows / $91,492.34 reinstated (header only, no GL).
  - 109 trucks filled from each row's own expense (= the load's truck).
- Baseline re-stamped from the live count (#23743): 322 / $174,619.42 = 176 + 146, exact delta.
- Guard 12047 now enforces "a posted fuel expense points at a live fuel row": 310 posted, 0 on a voided purchase.
  AUTH-190 CONSUMED.
- Reverse-routing screens shipped (#23739): vendor fuel; fraud alerts on unit/driver/load/vendor;
  fuel <-> expense/JE; Relay fills + unmatched worklist.
### Faro 09-25 — rows (live, USMCA)
| advance | Faro inv | load (Faro remittance) | purchase | net adv | funding JE (live) | reserve held | invoice link |
|---|---|---|---|---|---|---|---|
| FAC-2026-00138 | 101 | 13620 | $4,300.00 | $4,161.00 | funding, 2026-09-25, posted | $64.50, 09-25, JE | invoice 13620 (sent) |
| FAC-2026-00139 | 103 | **13625** (PO LGMX142 = load PO) | $6,250.00 | $6,062.50 | funding#rev1, 2026-09-25, posted | $93.75, 09-25, JE | **none**: invoice voided by AUTH-176 (owner rule: no invoice on an undelivered load; advance kept as real Faro money) |
| FAC-2026-00140 | 104 | 13626 | $3,400.00 | $3,298.00 | funding#rev1, 2026-09-25, posted | $51.00, 09-25, JE | none (same AUTH-176) |
| — | **102** | **13638** (owner fact) | $4,900.00 | $4,743.00 | **MISSING** | **MISSING** | none: 13638's pro-forma was deleted by AUTH-176 |
- 13625: VERIFIED. The advance exists, is posted, is dated 09-25 and has its reserve.
  - Linked to the load only by the Faro note (load "13625").
  - It will link to an invoice when 13625 is delivered and invoiced.
- 13638: MISSING. Faro 102 (PO SEM66542, S E Mares) is on the owner-supplied Faro CSV (AUTH-173 tie-out,
  docs/bus/09-28-2026-CC-2-ROUND-173-ITEM3-FARO-CSV-TIEOUT.md).
  - It was HELD on 09-28 (feed-round172 JOB3: "five Semares loads are $4,900").
  - The owner fact assigns it to 13638 (13638's own PO is 56713; Semares uses two numbering schemes).
- Money side:
  - The 09-25 $4,161.00 wire is matched to FAC-138.
  - The 09-25 $19,960.50 wire is matched to nothing.
  - Faro 099+100+102+103+104 nets total $21,960.50 ($2,000.00 above the wire); the remittance's deduction
    line is needed to close that.
### The engine gap (factoring lane, now mine) — building next
- POST /accounting/factoring-advances requires >= 1 live invoice.
  - A Faro purchase made at pickup (before delivery) cannot be created without breaking the owner's
    no-invoice-before-delivery rule.
  - That is why 13625/13626 are tied to their loads only by notes text (no FK: linkage law gap).
- Build:
  - factoring_advances.source_load_id (own migration).
  - The engine accepts a pre-invoice purchase anchored to the load.
  - The invoice created at delivery auto-links to that load's open advance.
  - Then FAC for Faro 102 -> 13638 through the engine under an AUTH.
  - Backfill 13625/13626 to the FK; guard.
- 11:20Z cron + 12:00Z Relay proofs will be pasted here when they land.

## 2026-10-01 08:30Z — CC-2 | CORRECTIONS from the owner's reconciliation (~/Downloads/09-30-26-UPDATED FIRST RECONCILIATION.xlsx — INFORMATIVE ONLY, owner: "DO NOT SEED THAT ... I WILL SEED THE NEXT LOADS MANUALLY TOMORROW")
- **Faro 102 (09-25, PO SEM66542) = load 13621** (settlement 5823, QB #102). NOT 13638.
  - My 07:15Z elimination ("102 -> 13638") is WITHDRAWN. Nothing was built on it.
  - The missing 09-25 advance is Faro 102 -> 13621.
- **Load 13638 = Faro 112, dated 2026-09-28** (PO SMX14683). It is not a 09-25 purchase.
  - Faro 87 (SEM66538) is also shown against 13638 only as "REVIEW: matched by Name + Amount + Date only".
- **13593 = ALIGATOR LOGISTICS, CANCELLED** (QB #74, 09-14; owner confirmed in chat).
  - The system has it invoiced, with an invoice, a driver bill and 3 fuel rows ($1,325.32, AUTH-145).
  - Needs the cancel/void chain under an AUTH, plus an owner ruling on the fuel.
- **Faro 7 (ITS Logistics, $350, WO 68747): "NO ALLWAYS LOAD".** FAC-2026-00007 legitimately has no load.
  - Guard 12055 must carry it as a named exception.
  - The live guard currently FAILs on FAC-00007 / 00139 / 00140.
- Faro 99 (Steam Logistics $2,400, 09-25): no AlwaysTrack load.
- Faro 105–118 (09-26..09-30, dispatched loads 13624–13643): not in the TMS. The OWNER seeds them manually; no seat does.
- Pending for the next CC-2 session (AUTH-191, engines live since deploy 7ace9f4f5d):
  - (a) Write source_load_id on FAC-2026-00139 -> 13625 and 00140 -> 13626.
  - (b) Add FAC-2026-00007 as 12055's named no-load exception (owner sheet).
  - (c) Faro 102 -> 13621: check its invoice/advance state, then build through the engine.
  - (d) 13593 cancel chain.
  - (e) 11:20Z cron proof and 12:00Z Relay proof.

## 2026-10-01 15:45Z — CC-2 | ROUND 313 — items 1 + 2 DONE and LIVE (deploy dep-dav7llu0tbcc73e17d60, 272699d4a6)
1. E-28 (#23785, migration 202615180600): one complaints store (safety.complaints) — NOT a second dispatch.driver_complaints.
   - Added: stop_id, driver_caused, broker/shipper sources.
   - Chargeback link: CHECK enforces driver-caused + approved + against a driver (owner C5:A).
   - POST /api/v1/safety/complaints/:id/chargeback goes through createSettlementDeduction. It requires an
     executor approver who is not the filer (F13:A).
   - GET /api/v1/drivers/:id/complaints.
   - Engine-board probe on safety.complaints.created_at. Guard 12059.
   - Screens (driver complaints tab + chargeback action) are next.
2. E-21 (#23787): ROOT CAUSE — the detector window was purchase date (last 7 days), and imports land dated weeks back.
   0 of 1,953 live rows (USMCA 322, TRANSP 1,631) were ever in the window, hence 0 alerts ever.
   - Fix: ingest-time window + backlog catch-up through the same engine. Guard 12019.
   - Backlog run as Render job job-dav7n9h7lnhs73b93ma0: succeeded.
   - fuel.fraud_alerts LIVE, all 'warn' (two-signal rule: 0 findings, so no critical pages):
     - USMCA: RULE_TANK_OVERFLOW 44
     - TRANSP: RULE_TANK_OVERFLOW 56, RULE_OFF_DUTY 12, RULE_RAPID_MULTI 5, RULE_INACTIVE_TRUCK 5, RULE_GPS_MISMATCH 4
     - Total 126. No planted rows.
   - (A read-only pre-check without derived pump times counted more OFF_DUTY/RAPID/INACTIVE hits. The engine
     evaluates date-only rows at their derived time.)
- DEPLOY UNBLOCKED again (#23789): 202615171200_accounting_bank_deposits.sql (#23770) was stamped on prod outside
  db:migrate with different bytes.
  - Prod schema verified identical to the committed file; sanctioned checksum override.
- Item 3 (FACT-TIEOUT-01 statement import + /factoring/statements + AUTH-191) is NOT started.
  - Per the owner's reconciliation, Faro 102 = load 13621 (not 13638) and 13638 = Faro 112 (09-28).
  - AUTH-191 will follow the owner's sheet, not "102->13638".

## 2026-10-01 16:10Z — ROUND 315 item 1 DONE: factoring clean slate LIVE (AUTH-193, #23805)

Owner decision applied: Faro is clean — **0 purchases**; all **110 USMCA invoices still listed** (93 unlinked → `not_factored`).
One transaction, sanctioned WORM purge bypass (`app.purge_auth_id='AUTH-193'`), 1 audit row `b7b25e3d`.
Row list (every advance id + amount + its JE ids): `docs/audit/2026-10-01-auth193-factoring-clean-slate-rows.json` (sha256 5754cb5d…).

| | before | after |
|---|---|---|
| factoring_advances (USMCA) | 95 / $325,162.98 | 0 |
| journal_entries (factoring chain) | 625 | 0 |
| journal_entry_postings | 2,009 | 0 |
| reserve movements / interest accruals / posting keys | 95 / 242 / 376 | 0 / 0 / 0 |
| invoices listed | 110 | 110 (factored: 0) |
| bank lines matched to an advance | 16 | 0 (lines kept) |
| USMCA posted trial balance net | 0 | 0 |

GL (debit +): **1100 A/R** 345,609.12 → 345,609.12 · **2150 Factoring Advance** -345,986.66 → 0.00 · **1230 Reserves** 5,175.30 → 0.00 ·
**6400 Fees** 5,191.74 → 0.00 · 6300 wire fees 230.00 → 0.00 · 6830 default interest 419.94 → 0.00 · 1210/1220/1235 0 → 0 ·
**1090 Undeposited Funds** 161,622.34 → **-151,736.34** · 1000 BofA Operating 174,005.11 → 152,394.11.

Why 625 JEs, not 440: rehearsal found (a) 3 reversal JEs outside the advance join (2 ROUND-175 reinstate reversals + the AUTH-169
reversal of FAC-00140's JE), tied by posting-level `reversal_of_line_id`; (b) 132 "Factoring funding FAC-2026-000NN" JEs whose advance
row had already been deleted by an earlier incarnation of the same purchase, plus their reversals. The 182 extra entries net to zero on every account.

**For the Lead / CC-1 — 1090 and 1000 (not a plug, not fixed by me):** the Faro wires are real cash, and the 16 bank lines stay. Two things
cleared 1090 against factoring funding: the 9 `factoring_advance_deposit` JEs (DR 1000, $21,611, now deleted) and CC-1's TB-close manual
JE ACCT-F20260925i (1090 → bank, $166,743.94, kept — not a factoring JE). Until the app regenerates the purchases (Submit tab →
funding DR 1090 / CR 2150), 1090 shows the Faro cash with no source. Closure path: the rebuilt Faro posting + bank match, never a manual plug.

## 2026-10-01 16:40Z — ROUND 315 (FINAL) steps 0–1: status

**Order of events (honest):** the FINAL arrived after AUTH-193 had already applied (16:09Z). AUTH-193 nulled only
`matched_factoring_advance_id` on the 16 deposits so the advances could be deleted — not the canonical unmatch. All 16
were left `review_state='matched'`, which `match.service` refuses to re-match. Repaired under **AUTH-194** (#23808 + apply)
through the canonical `void.service.ts unmatchBankTransactionById` + one audit row each (16 rows, source CC-2-AUTH-194).

**Step 0 — 16 bank deposits, before → after** (status / review_state):

| id | date | amount | before | after |
|---|---|---|---|---|
| 641d51be-4fb1-4dc5-a3fd-6ff2bd4cee75 | 08-10 | 5,325.00 | uncategorized / matched | pending_categorization / for_review |
| ab67cf21-eda1-4b95-809c-8f354acbb6c3 | 08-11 | 3,482.00 | uncategorized / matched | pending_categorization / for_review |
| 3e7b0fe6-3c29-49c9-a0e0-e70dcf09b8e7 | 08-12 | 1,639.00 | uncategorized / matched | pending_categorization / for_review |
| 6015691c-07f9-4394-b5f9-9e1f774b22d0 | 08-17 | 6,877.00 | uncategorized / matched | pending_categorization / for_review |
| 4e85aa7d-eb43-4ba0-bf05-03b214c5d964 | 08-18 | 3,676.00 | uncategorized / matched | pending_categorization / for_review |
| bb0d7690-fa3d-44f9-a71f-12947b3fcac6 | 08-19 | 6,392.00 | uncategorized / matched | pending_categorization / for_review |
| 6bd50475-1954-4b90-8de9-3f47206ae35c | 08-21 | 16,383.00 | uncategorized / matched | pending_categorization / for_review |
| 3c8eaab0-7888-4a5c-9485-949bd81b75b0 | 08-24 | 3,967.00 | uncategorized / matched | pending_categorization / for_review |
| 91b6c3e2-9fa5-48df-a272-5da3def18051 | 08-26 | 2,997.00 | uncategorized / matched | pending_categorization / for_review |
| b13ccf4f-13c2-4c8b-ad4c-a14f497553e9 | 08-31 | 13,473.00 | pending_categorization / matched | pending_categorization / for_review |
| 857028d1-95fc-4a89-9b3e-802356598f84 | 09-01 | 14,200.50 | pending_categorization / matched | pending_categorization / for_review |
| ec4ee110-a2af-4971-9ca6-2780fa7f2e2d | 09-03 | 10,466.00 | pending_categorization / matched | pending_categorization / for_review |
| bc2a018a-1f84-41cb-af74-bf54bc15e414 | 09-04 | 16,785.54 | pending_categorization / matched | pending_categorization / for_review |
| 193c4c52-4da6-4dec-8eef-deeaa5984e0f | 09-10 | 2,997.00 | pending_categorization / matched | pending_categorization / for_review |
| afa3616a-586e-404d-b0b7-4b7759736840 | 09-18 | 27,441.00 | pending_categorization / matched | pending_categorization / for_review |
| 3feba937-1aa5-463b-9ce7-054d404c1024 | 09-25 | 4,161.00 | pending_categorization / matched | pending_categorization / for_review |

**Step 1:** 95 advances + 625 JEs (= the 519 factoring-sourced JEs you listed + 106 reversals of them, net zero) — DONE, AUTH-193,
numbers in the 16:10Z entry above. **The two debtor-less fee rows** (Faro 103/104) were advances FAC-2026-00139/00140 —
deleted in the same AUTH-193 run (row list `docs/audit/2026-10-01-auth193-factoring-clean-slate-rows.json`).
**Factoring Default Interest 6830:** 419.94 → 0.00.

**OWNER-ONLY LAW — BUILT (#23815, ACCT-F9615):** one gate `apps/backend/src/factoring/owner-only-purchase.ts` on create, batch submit,
submission-queue submit, advance, reserve-held, release, recourse-return, and both bank-match accept paths (kind factoring_advance).
Non-Owner → 403 `factoring_purchase_owner_only` + committed audit row `factoring.purchase_refused_non_owner`. Delivery auto-submit
never creates a purchase now (2026-09-09 auto-purchase ruling superseded). Guard 12067 (static + live: 0 non-Owner purchases since
the clean slate). Deploy dep-dav8i367 (26258583c7) in progress; Chrome 403 proof with a non-Owner session follows the deploy.

**QUESTION FOR THE LEAD — 90007 NOT DELETED (fact conflict, not a decision):** the FINAL calls 90007 "ITS Logistics $350 (junk)".
The row is invoice `bba8411e-909e-4f1d-af21-1729a25a1ae7`, display 90007, status sent, $350, `is_sample_data=false`, A/R JE
d324689e (DR 1100 / CR 1150, revrec Event 2 of fabricated load 90007). Its own note (ROUND 166 JOB 3): "Invoice itself is real --
Faro purchased it -- kept as a non-freight invoice with no load link". The owner's reconciliation (09-30-26-UPDATED FIRST
RECONCILIATION.xlsx row 9) lists Faro 7 = ITS Logistics $350, "NO ALLWAYS LOAD" — guard 12055 carried it as named exception
FAC-2026-00007. So the record says real money. "All invoices stay listed" + "delete 90007" cannot both hold. Which is it: (a) delete
the invoice + its A/R JE + the Event-1 JE on load 90007 under an AUTH, or (b) keep it listed (it reappears only on the Submit tab,
since its advance is gone)? I hold until answered.

**DEFECT FOR THE DISPATCH LANE (CC-3 / Lead) — delivery latch leaves a transaction idle on mdata.loads:** at 16:21–16:27Z pid 27664
sat `idle in transaction` (ClientRead) for 3+ minutes right after `RELEASE SAVEPOINT delivery_invoice_convert_send`
(`dispatch/delivery-evidence-latch.ts:185`), holding a row lock on load 13626. It blocked the revenue-recognition insert (pid 24485)
and the leg-miles updates (pids 527 → 526). 13626 stays `dispatched` with no invoice, so the transaction that ran the latch never
committed. Something after `convertAndSendInvoiceOnDelivery` awaits non-DB work while the transaction is open. Measured with
`pg_blocking_pids`; not touched by me.

**Next (same 24h):** AUTH-195 — invoices for 13626 + 13637 through `buildInvoiceFromLoad` → `sendDraftInvoice` (script on branch,
rehearsal waiting on the lock above), then I2 proof; then step 2 (purchase document + one posting engine).

## 2026-10-01 16:32Z — ROUND 315 addendum (13626 / 13637 invoices): BLOCKED BY THE ENGINE'S OWN LAW — owner act needed

Script ready (not run, no AUTH opened): `scripts/ops/2026-10-01-cc2-auth195-invoice-delivered-13626-13637.ts` — the BOL path's exact
chain `buildInvoiceFromLoad` → `sendDraftInvoice`, one audit row; refuses sample data / no rate / no customer / no delivery stamp / a live invoice.
Rehearsal on production (rolled back): both loads pass those checks (13626 $3,400.00, departure 2026-09-26 00:10:03Z; 13637 $5,200.00,
departure 2026-10-01 15:04:53Z), the draft builds, and **send refuses**: `invoice_on_rolling_load_needs_authorization` — "its load is
still 'dispatched' and has not delivered, and no active manual delivery authorization is recorded" (invoice-send.service.ts:221).
That is the owner's own rule (no invoice on an undelivered load, AUTH-176), and `dispatch.manual_delivery_authorizations` has 0 rows.
I will not fabricate a customer approval or bypass the send gate.

**What unblocks it (owner act, one of):** (a) the owner records the delivered transition on 13626 / 13637 (AUTH-192 scope note:
"the owner enters these loads' delivery manually") — the delivery latch then converts + sends the invoice itself; or (b) a manual
delivery authorization with the customer's approval. After either, I run the script (or confirm the latch issued them) and paste
invoice ids, JEs and I2 = 13/13.

Note on the latch: the stuck `delivery_invoice_convert_send` transaction (pid 27664, 16:23:59Z, blocked revrec pid 24485) ended by itself
at ~16:28:40Z, after the 16:27Z deploy cutover; I terminated nothing. Defect for the dispatch lane stands (entry above).
Correction to the entry above: AUTH-194's PR is #23808 (as written — verified).

## 2026-10-01 16:45Z — ROUND 315 step 2: one DECISION conflict before the posting engine (building the document meanwhile)

Step 2 says the purchase posts "DR Factoring Advance receivable/undeposited, DR escrow reserve, DR cash reserve, DR fee, DR wire fee,
**CR A/R per invoice**". The live engine and the owner-locked accounting model (skill §D, questionnaire v3: "Factoring — secured
borrowing / recourse (ASC 860), NOT a sale: … A/R stays on books, no derecognition") post funding as:
DR 1090 cash clearing (net) + DR 1230 escrow reserve + DR 1235 cash reserve + DR 6400 fee + DR 6300 wire fee / **CR 2150 Factoring
Advance (liability, full invoice total)**; A/R goes down only when the debtor pays (DR 2150 / CR 1100) — `poster.service.ts:1-14, :976`,
guarded by verify-factoring-treatment. "CR A/R per invoice" at purchase is the SALE model (derecognition) — it would reverse §D.

**Question:** keep secured borrowing (A/R stays until the customer pays; the purchase lines carry the per-invoice A/R link, not a
credit) — or switch to sale treatment (CR A/R per invoice at purchase)? Until answered I build the purchase document (header + lines
per invoice, escrow and cash reserve as two columns, links invoice ↔ purchase ↔ load ↔ settlement ↔ customer ↔ bank) on the EXISTING
poster (secured borrowing), which reuses all GL math and changes nothing if you confirm §D.

Also found while mapping (will fix inside step 2): the Faro CSV import stamps `faro_purchase_date` from the line's `due_on`
(`faro-csv-import.ts:724`) and never passes `cash_rsv_cents` to the poster; the Reserve tab reads the legacy `factoring.reserve_movement`
(no GL) — step 6's "every tab reads the LEDGER" covers it.

## 2026-10-01 17:05Z — Lead rulings 16:45Z items 1–2 DONE LIVE + two money root fixes found on the way

**Item 2 — 13626 / 13637 (AUTH-196, applied):** both were already `delivered_pending_docs` by CC-3's geofence auto-delivery (#23821,
16:41:10Z). Issued through the from-load engine (`buildInvoiceFromLoad` → `sendDraftInvoice`):
| load | invoice | amount | A/R JE (DISP-01 Event 2) |
|---|---|---|---|
| 13626 | 13626 `dbf93c60-4911-49f1-b087-70a72bb8bdc5` sent, issue 09-25 due 10-25 | $3,400.00 | `0cd3fcfc` DR 1100 / CR 1150 |
| 13637 | 13637 `7858b5fd-5908-465e-a70d-7db83b5fc333` sent, issue 10-01 due 10-31 | $5,200.00 | `c4d40b35` DR 1100 / CR 1150 |
**I2 = 11** (ceiling 14 — lower it to 11), verify-reconciler-exceptions PASS.

**Root fix 1 — DOUBLE REVENUE (ACCT-F9616, #23828):** the revrec latch committed the revenue JE and its idempotency row in two
transactions; when the second failed (16:24Z, behind the idle latch) the next fire posted Event 1 again. Live duplicates reversed under
AUTH-196 via `reverseJournalEntryNoFlip`: `4c416f76` (13626, $3,400 — CC-3's proof JE, CC-3 asked) → `d2ca6542`; `715378ea` (13571, $4,900,
since 09-24) → `e941171e`. Now one transaction; a lost race rolls the duplicate back. Guard 12071 LIVE PASS (0 orphans / 254).

**Root fix 2 — NO DELIVERED-LOAD INVOICE COULD BE SENT (ACCT-F9617, #23831):** #23827's "refuse the send if the A/R post fails" treated
`INVOICE_REVREC_LATCH_OWNS_LOAD` as a failure — but for every latch-recognized load that code IS the design (Event 2 posts the A/R on the
same send). Reproduced on a branch with 13626. One named exemption; every other failure still refuses. Lead: please confirm this matches
ACCT-F9602's intent.

**Item 1 — 90007 DELETED (AUTH-197, applied):** load + invoice ($350) + its 2 JEs, audit `efaf7c19`. Children deleted; 2 docs files,
1 fuel tank event and 1 downtime event belong to real records — kept and unlinked. **Which load it duplicates:** none found — 90007 was the
only ITS Logistics load. **The duplicate pair in that window is 13513 / 13515** (FLS Transportation Services Ltd / FLS Transport Inc.,
both $525.00, PO 5772267 vs 005772267, 08-12→08-13 and 08-13→08-14; 13513 invoiced, 13515 closed). Not touched — owner to say which is real.

**Factoring model verified (owner asked "verify with Claude agent"):** CPA ANSWERS.docx ("It is a secured borrowing, because it is
recourse"), Architecture Blueprint §6, locked decision §8.6, claude/00-CANONICAL-FACTORING-POSTING-LOCKED.md ("Accounts Receivable is NOT
relieved here"). ROUND 315's "CR A/R per invoice" is a wording error — the purchase engine posts the CPA way. Same sources: the COMPANY
absorbs factoring chargebacks (CPA corrected C5, not the driver); recourse 95 days.

**Process notes:** my rehearsal script used a session-scoped RLS GUC on the pooler — caught by verify-no-session-scoped-rls-bypass, fixed to
SET LOCAL before any run. Executed AUTH-188/193 scripts archived (they tripped guards for every seat; my #23805 push stopped at the first red
and never ran the rest — I now patch the pre-existing stale baselines locally, uncommitted, to see the whole gate).

## 2026-10-01 17:55Z — ROUND 318 item 1 HELD (13515 is a real trip) · step 2 LIVE · step 3 building · notes for CC-1 / Lead

**13515 NOT DELETED — measured, it is a second real trip, not a duplicate load.** Only the BILLING looks duplicated.
| | 13513 | 13515 |
|---|---|---|
| driver / truck | Pedro Abraham Lopez Collado / T152 | Leonel Antonio Morales / T175 |
| stops | rest Waco → pickup **Carrollton 08-12** → Laredo 08-13 | rest Arlington → pickup **Seagoville 08-13** → Laredo 08-14 |
| driver pay | settlement **5772 closed**, driver bill paid | settlement **5776 closed**, driver bill paid |
| fuel / expenses | 1 fill $734.19 / 1 expense $734.19 | 4 fills $2,991.65 / 14 expenses $3,240.41 |
| invoice | 13513 sent $525, unpaid | 13515 **paid** $525 — customer payment 411c9b24 (09-21) applied |
| customer / PO | FLS TRANSPORTATION SERVICES LIMITED / 5772267 | FLS Transport Inc. / 005772267 |
Deleting load 13515 would orphan a closed settlement, a paid driver bill, 4 fuel fills, 14 expenses, a bill, an escrow-ledger row, a deduction
and a received $525 payment. The owner's sheet row (QBO inv 9 "Duplicate / Not-Factored / Cancelled") names an INVOICE. **Question for the
owner/Lead:** did FLS pay ONE $525 for two trips (then one invoice is duplicate billing and the other trip is unbilled or billed elsewhere), or
are both trips billable? Nothing written until answered.

**Step 2 LIVE path:** #23849 merged (factoring purchase document + posting engine, ACCT-F9618); deploy dep-dav9ln4c (7192aec248) queued at
17:39Z. Rehearsed end to end on throwaway branch br-rapid-rain-akz830pt: non-Owner 403; FP-2026-00001 on 13626+13637 posted DR 1090 8,236 /
1230 129 / 1235 86 / 6300 20 / 6400 129 / CR 2150 8,600 (A/R not relieved, CPA way); void reversed (585f8b64). Bank match stays the canonical
bank-recon accept (kind factoring_advance = the purchase's advance), Owner-only.

**Step 3 (Submit to Factor tab):** building now (candidates endpoint = every open invoice, customer direct pay = migration 202615190600 claimed,
totals, Save / Save and send, Feed Gate on Save). Chrome screenshot with a selected set + totals goes here when live.

**For CC-1 (Lead item 2, ROUND 317 item 1 — closed):** duplicate revenue JEs reversed under AUTH-196: 13571 `715378ea` → reversal
**`e941171e-b205-4326-a653-e2a7aa7d598f`** (dated 2026-09-08); 13626 `4c416f76` → `d2ca6542`. Root fix ACCT-F9616 #23828, guard 12071.

**Neon throwaway branches I created — deleted (Lead item 4):** br-silent-fog-ak2l100x, br-bitter-haze-akhap2i3, br-summer-mode-ak5t7ruu,
br-rapid-rain-akz830pt.

**Question for the Lead (guard verify-cash-flow-reads-delivery-date):** its hard-coded pin expects 13637 due 2026-10-01, but the from-load
engine stamps Net-30 when a customer has no terms (`payment_terms_days ?? 30`, from-load.ts:217) → 13637 due 10-31. 62 USMCA invoices for
customers with no terms are Net-30 that way; 1 is due on delivery. The guard's invoice-level rule (due = delivery + the invoice's terms) passes.
Decision: is the no-terms default Net-30 (then re-pin 13637 to 10-31) or due-on-delivery (then the engine default changes and 62 invoices'
due dates need an AUTH)? Not touched.

## 2026-10-01 18:30Z — ROUND 319 ACKNOWLEDGED · owner decisions: Net-30 default, broker-by-name

**ROUND 319 acknowledged (CC-2):** no Chrome / screenshots as proof (proof = rows, JEs, FKs both ways, guard exit 0, tests — the Submit tab
proof will be the candidates endpoint response + a posted purchase on a throwaway branch, not a screenshot); build only, fully; no feeding data
into USMCA (rehearsals on throwaway Neon branches only); the owner posts every factoring purchase himself; gate hygiene — and my miss today:
202615180800's tables were not classified in verify-transaction-linkage-law TABLE_REGISTRY (the Lead did it). Cause: my gate run stopped at
another seat's red before that guard ran. From now on every new table is classified in the same PR and I run that guard explicitly.

**Owner: "CUSTOMERS WITH NO PAYMENT TERMS 30 DAYS"** — matches the from-load engine (payment_terms_days ?? 30). verify-cash-flow-reads-delivery-date
re-pinned 13637 → 2026-10-31; guard PASS live.

**Owner: broker / logistics / freight names are Brokers** — migration 202615190700 (trigger trg_customer_broker_by_name sets customer_type
'broker' + the company's BROKER customer_type_id on insert / name / type change; rehearsed rolled back on prod: idempotent, a broker name saved
as direct_shipper is forced to broker, touching an existing row re-stamps it), guard 12075 (fails closed live until the pass runs), AUTH-198
re-stamps existing rows after deploy: USMCA 640 (652 match), other entities 722 + 677, 0 direct shippers overridden.
**For the owner — NOT auto-classified (name says transport / trucking / express / carrier / shipping / cargo, 237 in USMCA):** these can be
carriers or shippers; tell me which words also mean Broker and I add them to the rule.

## 2026-10-01 18:12Z — ROUND 315 step 3 LIVE: Submit to Factor tab (#23864, ACCT-F9619) · broker classification live (AUTH-198)

**Live proof (ROUND 319 — rows/endpoints, no screenshots):** deploy 07362a6470 live 18:10Z; accounting.invoices.factoring_direct_pay_at /
_by_user_id / _reason present (migration 202615190600); GET /api/v1/factoring/purchases/candidates → 401 unauthenticated (mounted);
read-only candidate query on live USMCA = **106 open invoices, $374,659.12** (old submission queue: 13). Health ok.
**What the owner does (Factoring → Submit Invoice):** select invoices → totals (gross / escrow / fee / advance / cash reserve / wire fee / net)
→ **Save** = create + post FP-YYYY-##### through the purchase engine (CPA: A/R not relieved) or **Save and send** = + email Faro the invoices PDF,
CSV schedule and load docs. Feed Gate runs server-side before every create (adds: load present + posted A/R JE). Owner-only (403 + audit).
Customer direct pay per row (+ undo). Tests: backend 24/24 + feed-gate 9/9, frontend 4/4; tsc clean; 12067 / linkage-law / lane-band OK.
**Known limits the owner will meet:** (1) Save and send is blocked for every open load today — none has BOL / POD / rate con on file (only
dispatch instructions); Save works. (2) No Faro vendor email on file — the tab has a "Send to" field. (3) Expected cash reserve = 0 (no
cash-reserve rate on the factor); Faro's actuals can be entered per line.
**Broker classification LIVE:** AUTH-198 applied — 2,056 broker-named customers categorized Broker (USMCA 657 incl. deactivated); 12075 LIVE PASS;
audit 4bf5bfe9.
**Open for the owner:** 13513/13515 (two real trips, one $525 billing?) · which of 237 transport/trucking/express names are also Brokers.
**Next (CC-2 factoring scope, ROUND 315 steps 4–8):** invoice posting law check on create paths, Payments to You per wire, tabs root fixes +
Escrow tab, Home KPIs + cash flow per day, reserves/deductions shared with banking — every tab reads the LEDGER.

## 2026-10-01 18:55Z — Owner override approval + Faro actuals per invoice LIVE (#23878, ACCT-F9620)
Live proof: deploy 487333ab51 healthy; accounting.factoring_purchases.docs_override_at / _by_user_id / _reason present 18:53Z (migration 202615190800).
**Override approval:** Save and send with missing BOL / POD / rate con proceeds only with an Owner reason (>= 10 chars), stamped on the purchase +
audit row `accounting.factoring_purchase_docs_override_approved`; without a reason it is refused as before (guard 12067 pins it).
**Cash reserve rates (owner asked; CPA file):** contract = ONE 1.5% Security Reserve per invoice (CPA ANSWERS.docx). Faro's 89 purchases (PURCHASE REPORT
ALL.csv): fee 1.5% 89/89; reserve 1.5% 86/89 — Escrow Rsv on 83, Cash Rsv on 6, never both. App rates (factor + canonical agreement: reserve 1.5%, fee 1.5%)
already match; no rate change. New per-invoice actuals editor (escrow / cash reserve / fee + "Reserve in cash") records Faro's bucket on each line.
Local gate exit 0. Report-only reds noted (not CC-2): purge-era closure 21 — A/R vs open invoices gap $20,800 = the five line-less invoices
13616/13618/13620/13621/13622 (Lead's repair script, held by the no-feed rule); closure 39 — 17 loads missing mileage (dispatch).

## 2026-10-01 19:15Z — ACK: CC-2 | ACK ROUND-321 | WORM-FUEL-CARD | GO — items 1, 3, 6 done; item 2 HELD with facts

**1. WORM (done, with a correction):** #23884 attached the canonical trg_worm_refuse_delete -> accounting.refuse_financial_row_delete to
fuel.fuel_card_assignments AND banking.bank_account_tieouts (migration 202615200600, live 19:03Z). Measured cause of every seat's red: the ratchet
scans migration files for accounting / banking / driver_finance / factoring ONLY — **banking.bank_account_tieouts (202615180200)** was the 89 -> 90,
not the fuel table (fuel is out of the ratchet's scope). My #23884 baseline wrongly listed the fuel table and set 88 → red; **#23888 corrected it:
89 unprotected, verify-worm-coverage-ratchet OK (79 protected), verify-new-financial-table-ships-worm OK.** The fuel table keeps the canonical trigger anyway.

**3. Override approval:** already live (#23878, 18:53Z) — Owner-only (route gate 403 + audit for every other role), reason >= 10 chars, purchase stamps
docs_override_at / _by_user_id / _reason, audit event `accounting.factoring_purchase_docs_override_approved`, covers DOCUMENTS only (Feed Gate still
requires load + posted A/R JE on every invoice). Still to do from item 3: record the override in the Feed Gate as na-with-reason — next.

**6. POD releases the invoice — DONE (#23887, ACCT-F9621):** BILLING_EVIDENCE_DOC_CODES = ['bol','pod'] read by the existence check, the awaiting
queue and the upload trigger; same gates; idempotent. vitest 5/5, guard 12079 (static + live: bol+pod categories present).

**2. 13515 — HELD. The ruling's premise does not match the database; owner/Lead please re-confirm with these facts:**
- 13515 is NOT "never invoiced": invoice 13515 is **paid** — customer payment 411c9b24 ($525.00, 09-21) is applied to it. Invoice 13513 is sent, unpaid.
- Two different trucks and drivers ran them: 13513 = Pedro Abraham Lopez Collado / **T152**, pickup Carrollton 08-12, 1 fuel fill $734.19, settlement
  **5772** closed; 13515 = Leonel Antonio Morales / **T175**, pickup Seagoville 08-13, **4 fuel fills on T175 08-09..08-13 ($2,991.65)**, 14 expenses
  ($3,240.41), settlement **5776** closed, driver bill paid, escrow-ledger row, deduction, vendor bill.
- Deleting load 13515 would orphan Leonel's paid settlement, T175's real fuel and expenses, and the $525 payment.
If it truly is one billable load, the correct move is NOT a delete but: (a) re-apply payment 411c9b24 from invoice 13515 to 13513 (13513 becomes
paid), (b) void invoice 13515 + reverse its two revenue JEs (2c730468 Event 1, 396efaa2 Event 2) so revenue counts once, (c) KEEP load 13515's trip
costs (T175 fuel / expenses / settlement 5776) — they are real costs of a second truck — or tell me where they belong. Nothing written until answered.

**Next (in order):** Feed Gate override as na-with-reason (item 3 remainder) → item 4 (factor setup: Faro submission email default, escrow + cash
reserve rate fields read by candidates + engine) → ROUND 315 steps 4–8.

## 2026-10-01 19:35Z — WRAP

ACK: CC-2 | ACK WRAP | ROUND 321 item 4 (factor escrow + cash reserve rates + Faro submission email) | GO

CC-2 | WRAP 2026-10-01 | DONE: #23884 e7cf65c35d (WORM trigger fuel_card_assignments + bank_account_tieouts) · #23888 2ca848311e (WORM baseline
correction, 89) · #23887 a379ea869d (POD releases the invoice, ACCT-F9621) · #23892 fde7bc0426 (Feed Gate docs override na-with-reason, ACCT-F9622) ·
#23898 be6e8877aa (factor cash_reserve_rate + submission email, ACCT-F9623) · earlier today #23849 / #23864 / #23878 (purchase document, Submit to
Factor tab, override approval) | LIVE PROOF: factoring.factor.cash_reserve_rate live 19:31Z (migration 202615200700), both factors reserve 0.0150 /
cash 0.000000; trg_worm_refuse_delete live on both tables 19:03Z, verify-worm-coverage-ratchet OK (79 protected / 89 at baseline),
verify-new-financial-table-ships-worm OK; 12079 LIVE PASS (bol+pod categories); backend factoring vitest 95/95; health ok on be6e8877aa |
UNFINISHED: (1) ROUND 321 item 2 — 13515 delete HELD: the database contradicts the ruling's premise (13515 has a PAID invoice — payment 411c9b24
$525 applied — two different trucks/drivers T175 Leonel vs T152 Pedro, closed settlements 5776 vs 5772, T175 fuel $2,991.65 + 14 expenses);
exact next step: owner/Lead re-confirm with those facts; if one billable load, re-apply payment 411c9b24 to 13513, void invoice 13515 + reverse JEs
2c730468 / 396efaa2, keep 13515's trip costs or name where they belong — one AUTH. (2) ROUND 315 steps 4–8 not started: Payments to You per wire →
tabs root fixes + Escrow tab + ×100 money-formatter guard → Home KPIs + cash flow per day → reserves shared with banking. (3) Owner to enter:
Faro submission email + cash reserve rate on Factoring → Edit Factoring Profile. | HANDOFF-TO-CURSOR: none.

Ambient reds (NOT CC-2, not patched): verify-migration-no-number-collision — 202610011900_recon_service_charge_expense_fk.sql is stamped in the prod
ledger but absent from db/migrations (blocks pre-push for every seat); report-only: verify-purge-era-closures-still-hold (closure 21 A/R gap $20,800
= invoices 13616/13618/13620/13621/13622 without A/R; closure 39 loads missing mileage), verify-usmca-book-equals-faro-and-alwaystrack (5 issues),
verify-costs-are-expenses-not-handwritten-jes (JE cf78c2aa, Cursor). FactoringHome.vendor-merge-deeplink frontend test fails on main.
Neon throwaway branches deleted: br-silent-fog-ak2l100x, br-bitter-haze-akhap2i3, br-summer-mode-ak5t7ruu, br-rapid-rain-akz830pt (today) +
br-empty-rice-akqh08we, br-plain-mouse-akjigngx, br-billowing-lake-akmom1dj (CC-2 rehearsals from 09-25). None remain.

## 2026-10-01 20:05Z — bus checked: no new CC-2 order · built the reverse half of my own engine (#23931, ACCT-F9624)
Bus since WRAP: 13515 resolved by Cursor under AUTH-201 (void-not-delete shape from my held facts); ROUND 315 steps 4–8 taken over by Cursor
(FACTORING-TAKEOVER FT1–FT5, on the CC-2 purchase engine); cost JE cf78c2aa handled (AUTH-199). Nothing addressed to CC-2.
Gap closed (ROUND 315 step 2 "renders on invoice, load, customer, bank"): the purchase rendered only in Factoring + Banking. Now the invoice
detail (Factoring panel, always shown), the load's Factoring tab and the customer drill modal list the purchases they sit on — purchase, date,
the record's OWN gross / escrow / cash reserve / fee (new line-share lateral in listPurchases, executed read-only on prod), wire net, funding JE,
matched bank deposit, every id linked. Gate exit 0; backend 95/95, FE 2/2 + 37/37.

## 2026-10-02 18:45Z — DONE: Lead ROUND 296 / 297 CC-2 items (merged + deployed) · day 95 now ASKS
- #24166 3cf2a1dafa — per-customer Faro reserve stays a table (one query, ties to GL 1230 + 1235); Reserve Held / Recourse Return stop writing. Backend dep-davv4l8u01pc7388qi10 live.
- #24171 38f299f412 — the reserve projection closes: one purchase-rate resolver (customer assignment -> company Faro agreement -> named none). Prod read-only: 105/105 priced (98 assignment, 7 company agreement), base $374,134.12, escrow $5,612.02 vs 1.5% = $5,612.01.
- #24172 675b7f0f06 — the "Duplicate factoring vendors" banner pairs only factoring vendors (60 driver pairs -> 0). Backend dep-davv9nla1vls738q30a0 live @ 675b7f0f06.
- #24176 76efa8cf73 — money in a table cell is right-aligned + tabular-nums app-wide (191 cells / 26 files, statements first) + guard verify-money-table-cells-aligned. Backend dep-davvcvekemhc73ebjmfg live; web live @ b2d96d4107 (contains it).
- THIS PR — day 95 asks the owner, never recourses. Prod finding: FACTORING_GL_POSTING_ENABLED is ON for all three companies, so the 05:30 cron was armed to post nightly default interest and to auto-chargeback on day 95. It had posted nothing (0 postings on 2155 / 6830, 0 interest / chargeback postings), so nothing to reverse. Now the cron only registers accounting.factoring_repurchase_due_events (migration 202615220700); the owner answers EXTEND / CONFIRM REPURCHASE / MARK COLLECTED on /factoring (panel shows only when a deadline waits) and in Today's Attention. Nothing posts on any answer. Guard verify-day95-asks-never-recourses. Rehearsed on br-raspy-moon-akol6tw8 (deleted).
Next (CC-2 lane): period-close interest accrual DR 6830 / CR 2155 with approval + guard 2150 = open Net; lifecycle posters (schedule fee, short-pay, Rsv deposit, escrow->cash, repurchase) on the caller's client; Faro report import row-shape validation (row 405560 Inv/PO swapped) — owner runs it.

## 2026-10-02 19:25Z — DONE (this PR): Faro default interest posts once at close, with approval · 2150 = open Net guard · #24185 live both services
- #24185 6e94681aa0 live: backend dep-davvp4dg1s2s73c23qvg (migration 202615220700 in the prod ledger 18:51:04Z, route answers 401 not 404); web live @ 2d36f4e8ed (contains it).
- THIS PR: month-end accrual run (migration 202615240600): one user proposes (lines per open Purchased Account, 0.067%/day compounded from day 36 on Net, less earlier posted runs), a DIFFERENT user approves (CHECK + service refusal) and one JE posts DR 6830 / CR 2155, every line stamped to its invoice (source) + customer (entity). Month close cannot lock while interest is due and unposted. Guard verify-factoring-interest-at-close-2150-ties: static 4/4 + live 2150 = open Net (prod: no 2150 postings, no posted purchases; positive control 2 bindings). Rehearsed on br-purple-cloud-ak8gyw2v (deleted): 11/11 refusals.
- FINDING (my own lane, fixed in the NEXT block): journal_entry_postings.entity_type is CHECK-limited to customer/vendor/driver/unit — never 'invoice'. reserve-by-customer (#24166) reads entity_type='invoice' stamps that cannot exist, so every reserve movement lands in "Not stamped" (the total still ties to GL; no movement exists on prod yet). The lifecycle posters block gives each Faro event its own document row and the report joins through it.

## 2026-10-02 20:20Z — DONE: #24199 + #24203 live · THIS PR: the Faro reserve registers (report = bank feed, posters, owner-run import)
- #24199 d6aac8d4bb (month-end interest, maker/checker) — backend dep-db00bm49v7es739eaqr0 live, web dep-db00bm5ckfvc73cauhcg live; 202615240600 in the prod ledger 19:30:26Z.
- #24203 463b17dbb3 (statement upload idempotent, BANK-F9341) — backend dep-db00gvvavr4c73dm36pg live; web live a1fee5378e contains it. USMCA's 2 existing identical csv_import groups left untouched (owner's call).
- THIS PR (migration 202615250600): accounting.faro_reserve_entries = one row per Faro report line; Faro's Inv captured on the purchase line (factoring_purchase_lines.faro_invoice_number — measured: PO Ref# resolves 8/135 escrow rows, 3 to the wrong debtor; Faro's Inv matches nothing of ours, so it must be captured at purchase); import Owner-only with shape validation; posters: escrow held = matched to the funding JE (amount must equal the line's escrow), escrow->cash DR 1235 / CR 1230 one JE for the pair, schedule fee DR 6405 / CR 1235, short-pay DR 2150 / CR 1235, client payable to IH 35 DR 8000 / CR 1235; Rsv Deposit and client payable to us refuse (payment / transfer match). reserve-by-customer now joins through the entries (fixes the impossible entity_type='invoice' predicate). Rehearsed on br-misty-silence-aklagqmq (deleted) with both real reports: 134 + 47 imported, 405560 rejected inv_po_swapped, re-import 0, one of each kind posted, per-customer table ties to GL.
- FOR LEAD — short-pay leg: built as DR 2150 / CR 1235, not "DR A/R variance". Reason: the approved lifecycle has customer-pays-Faro relieving A/R and 2150 by what was PAID (3,750), so the unpaid 250 is still open on the customer's invoice — that IS the visible A/R variance (reason recorded on the entry). Faro taking 250 from our reserve satisfies the rest of its advance, so 2150 is what it relieves; a DR A/R would book the 250 a second time. If you rule otherwise, it is one line in faro-reserve-entries.service.ts and the guard.
- FOR CURSOR (cross-lane, not edited): apps/backend/src/accounting/bank-recon/match.service.ts (~L1474) reads catalogs.account_role_bindings to recognise the reserve register; the canonical role table is accounting.chart_of_accounts_roles, and its reserve branch still runs the old chargeback poster (the Lead voided "DR A/R back"). The Faro register posters to call are exported from apps/backend/src/factoring/faro-reserve-entries.service.ts: postFaroReserveEntryOnClient(client, …) and faroReserveDepositsOn(client, oci, date) for the payment match's Rsv Deposit legs.
- Also found: the CHECK-extension idiom in 202615220800 (quoted-name regex) silently no-ops now that the roles CHECK is an array literal; 202615250600 parses both forms and refuses if it cannot read the list.

## 2026-10-02 20:45Z — DONE: #24222 live (Faro registers) · THIS PR: negative Faro Cash Reserve presents as Due to Faro
- #24222 01ce152cdb — backend dep-db011venfi0s738b3a60 live (202615250600 applied: verify-faro-reserve-registers PASS on prod, positive control 2/2); web live 083d821230 contains it. verify-faro-reserve-by-customer-ties-to-gl PASS on prod.
- THIS PR (migration 202615260600): 2156 Due to Faro — Cash Reserve Deficit (USMCA, role factor_cash_reserve_deficit_payable); at close a credit balance on 1235 is reclassed DR 1235 / CR 2156 on the period end and reversed the next day; month close cannot lock while the deficit is unreclassed or the reclass is stale. Rehearsed on br-wispy-flower-akcxolgl (deleted) with Faro's -0.51: 09-30 shows 1235 0.00 / 2156 0.51 liability, 10-01 back to -0.51.
## 2026-10-02 21:05Z — ACK OWNER RULING 2026-10-02 (relayed by CC-3, 00-OWNER-RULING-2026-10-02-CC2-ACCEPTED-PLUS-FOUR-RULINGS.md) — working it in the owner's order
1. #24166 spine fix — THIS PR. The per-customer reserve reads each leg's invoice off accounting.transaction_source_links (linked_object_type = invoice); the Faro posters (#24222) and the interest approval (#24199) write the spine links on the posting's transaction (writeTransactionSourceLink). Rehearsed on br-royal-feather-akzqiadt (deleted): every invoice-backed leg linked; table ties to GL.
2. Repurchase-time accrual — NEXT. And it settles correction 1:
   SCHEDULE FEE — PROVEN FROM FARO'S OWN REPORT: it is neither the Factoring Fee nor a Transaction Fee. It is the contract's DEFAULT INTEREST, charged against the cash reserve on the collection date. All 11 rows: fee = 0.067%/day compounded for exactly the days past day 35 between Faro's purchase date (Escrow Held date) and the fee date (implied days 1.0 / 3.9 / 3.0 / 5.9 / 8.8 / 2.0 / 13.7 / 2.0 / 12.8 / 1.0 / 5.9 vs actual 1 / 4 / 3 / 6 / 9 / 2 / 14 / 2 / 13 / 1 / 6), on a base of ~98.3% of Net (Net less the 1.5% Factoring Fee). So #24222's DR 6405 for it is WRONG (it would expense interest twice against the 2155 accrual). Correct: accrue interest through the collection date (DR 6830 / CR 2155, the event-time accrual you ordered), then the Schedule Fee relieves it: DR 2155 / CR 1235. Building that next, with the accrual base set to Faro's (Net − Factoring Fee).
3. Possible-duplicate badge (no deletion) — after 2.
4. Next block corrections: short-pay as two entries with a shared link (reason-coded DR <reason account> / CR A/R on the customer + DR 2150 / CR 1235) — after 3. Due-from-affiliate is ALREADY compliant: 8000 "Inter-company - IH35 Transportation" is in USMCA's own chart, the counterparty is the text label 'ih35_transportation' on the entry, no FK to the frozen company, nothing read or written there.
- #24235 462e873aae (negative cash reserve -> 2156 Due to Faro at period end) merged; deploys requested.

## 2026-10-02 21:30Z — DONE: #24238 live (spine) · THIS PR: owner item 2 — interest accrues at collection / repurchase; Faro's Schedule Fee relieves it
- #24238 a20d5e9819 (reserve reads the spine) — backend + web live (live 3fde990526 contains it); #24235 also live there; verify-faro-cash-reserve-presents-as-payable PASS on prod (202615260600 applied).
- THIS PR (migration 202615270600): event runs on the same maker <> checker path and account pair (DR 6830 / CR 2155), one live per (purchase line, date); month end skips accounts Faro already collected (Transfer Escrow to Cash dated on/before period end) and cannot lock while an event run awaits its approver. Faro's "Schedule Fee" (= Default Interest, proven 11/11) now posts only after its event accrual: DR 2155 accrued / DR-or-CR 6830 true-up to Faro's figure / CR 1235 — #24222's DR 6405 rule is gone. Interest base = Net − Factoring Fee (Faro's measured base). Repurchase: the same interestPositionThrough / proposeEventInterestAccrual is what the repurchase poster calls when it lands.
- Rehearsed on br-noisy-mud-ak5usapb (deleted) through the real purchase engine: purchase posted, fee post #1 proposed 2.64 through 09-18 and posted nothing, post #2 re-pointed to the same pending run, maker approval refused, checker approval posted 6830/2155, fee post relieved 2155 to 0.

## 2026-10-02 22:00Z — DONE: #24245 + #24249 · THIS PR: owner item 4 — short-pay is two entries with a shared link
- #24245 44d522c0a4 (event-time interest; Schedule Fee = Default Interest) — backend dep-db0291egekts73ft9ic0 live, web dep-db02918u01pc738j5kpg live; 202615270600 applied 21:41:27Z; verify-faro-reserve-registers + verify-factoring-interest-at-close-2150-ties PASS on prod.
- #24249 091692546d (possible-duplicate badge, BANK-F9342) merged; deploys requested. verify-bank-possible-duplicates-flagged-never-removed PASS on prod (3 groups / 6 lines, none removed).
- THIS PR (migration 202615280600): the short-pay's CUSTOMER side is the Owner's decision — written down = a reason-coded credit memo applied to the invoice (A/R subledger) + DR <reason account> / CR A/R 1100 on that customer, linked on the spine to the SAME Faro entry + invoice as the reserve entry (DR 2150 / CR 1235) and to the credit memo; or kept open (disputed, no entry; may be written down later). Reasons resolve USMCA's own short-pay chart by system_purpose (4910-4980) + new 6920 Bad Debt Expense (role bad_debt_expense). Rehearsed on br-small-cell-ako4jouj (deleted): invoice open 4,000 -> keep open 4,000 -> write down (billing error) 3,750; legs 4955 DR / 1100 CR on the customer; credit memo billing_error_ours applied; Accountant refused; second write-down refused; DB refuses changing a write-down.
- OWNER RULING items 1-4 all built. Correction 3 (affiliate) was already compliant (see 21:05Z).

## 2026-10-02 22:20Z — ACK ROUND 332.1 (10-02-2026-ALL-CODERS-ROUND-332.1-THE-STANDARD-AND-THE-LINKAGE-LAW.md) · #24255 live
- #24255 8c70f6753f (short-pay two entries) — backend dep-db02j46nfi0s738c9350 live; web live 48a411eb93 contains it; 202615280600 applied 22:07:18Z; verify-faro-reserve-registers PASS on prod (17/17). #24249 (possible-duplicate badge) live in the same builds.
- PRE-FLIGHT run this turn: no CC-2 PR open (#24258 open is CC-1's); 12 most recent merges read; migrations of mine all on prod ledger (202615220700, 240600, 250600, 260600, 270600, 280600).
- §4c applied to my own lane — THIS PR: the purchase funding entry linked only to the advance (invoice half missing) and the Due-to-Faro reclass linked to nothing. Both now write the spine in the posting transaction (funding legs -> factoring_purchase + every funded invoice; reclass + reversal legs -> the reclass). One generalized guard over every factoring writer: verify-factoring-writers-write-the-spine.
- §4 LINKAGE DECLARATION for today's CC-2 PRs (they predate this law's PR-body rule):
  #24185 day-95 events: mdata.customers, accounting.invoices (invoice_id, customer_id FKs, event->hub); mdata.vendors (factor_vendor_id); journal_entries N/A — posts nothing. drivers/units/equipment/loads(N/A — via invoice)/work_orders/docs N/A.
  #24199 interest runs: invoices + customers (run lines FKs; JE legs spine 'invoice'); catalogs.accounts via roles (6830/2155); journal_entries (run.journal_entry_id); users (proposer/approver FKs). drivers/units/equipment/work_orders/docs N/A — financing, not operational.
  #24222 Faro entries: banking.bank_accounts/bank_transactions (FKs), invoices + customers + factoring_purchases (spine via purchase-line Faro Inv), journal_entries (journal_entry_id + spine 'faro_reserve_entry'), users. Loads N/A — reached via the invoice.
  #24235 reclass: journal_entries (two FKs; spine added in THIS PR), catalogs.accounts via roles (1235/2156), users. Customer/invoice/load N/A — pool-level presentation.
  #24245 event runs: purchase line -> invoice/customer (FK), JE spine 'invoice'. #24255 short-pay: invoice + customer + credit memo + Faro entry on the spine, both entries. #24203/#24249 banking: bank_accounts (identity scope) — no JE, N/A for the rest.

## 2026-10-02 22:30Z — ROUND 335 §6 DONE: 2150 = open factored Net re-run through a short-pay on a fork (THIS PR) · #24259 live
- #24259 1941465f9f (spine completeness) — backend dep-db02q57avr4c73du4mbg live, web live at 1941465f9f; verify-factoring-writers-write-the-spine PASS on prod.
- FINDING while re-running: the guard's open Net was "purchased gross of every live line" — a short-pay could never tie under it, written down or not. Corrected (not a term): open Net of a purchased account = the invoice's open balance (total − paid − credit memos applied), capped at the purchased gross; engine (advanceLiabilityTiesToOpenNet) and guard use the same expression, asserted statically.
- Fork br-twilight-fog-akxb8ofd (deleted), invoice 010 (4,000.00), Faro Inv 012:
    before (prod copy)                            2150        0 | open Net        0 | TIES
    1. purchase posted                            2150  4000.00 | open Net  4000.00 | TIES
    2. short-pay reserve side DR 2150 / CR 1235   2150  3750.00 | open Net  4000.00 | BREAKS (unresolved)
    3a. kept open (dispute)                       2150  3750.00 | open Net  4000.00 | BREAKS — the named exception, as ruled
    3b. written down (rate dispute, credit memo)  2150  3750.00 | open Net  3750.00 | TIES — credit memo moved open Net by exactly 250.00
  (The customer's 3,750 to Faro is not in the run: the collection poster is unbuilt; it moves both sides by 3,750.)
- §2 applied: keep-open now REQUIRES a dispute note (what is being disputed) — a named exception, never a resting state; write-down is the default.
- Item 9 re-measured on prod (all 167 factoring/Faro guards, exit codes): 30 red, not 9. Triage next, in my lane.

## 2026-10-02 22:40Z — ROUND 336 CC-2 lane (rule 7) — THIS PR · #24261 merged (ROUND 335 open-Net)
- Rule 7 in the DATABASE (migration 202615300600): triggers on accounting.invoices (subtotal / tax / total) and accounting.invoice_lines (insert / delete / amount update) refuse any amount change while the invoice is on a live line of a posted, unvoided Faro purchase and still has an open balance. The refusal names the invoice, the purchase and the Faro invoice number and points at the ROUND 335 reason-coded credit memo. Non-amount fields stay editable. Read endpoint for Cursor's edit UI: GET /api/v1/factoring/invoices/:id/amount-lock (amount_locked, held_by, editable fields, reduce_with).
- Fork br-divine-night-akwg59am (deleted), invoice 010 (4,000.00), Faro Inv 012 — the 2150 guard against an edit attempt and a credit memo:
    unfactored: total edit                                 ALLOWED
    1. purchase posted                                     2150 4000.00 | open Net 4000.00 | TIES
    edit total 4,000 -> 3,000                              REFUSED  "invoice 010 is collateral on purchase FP-2026-00001 (Faro Inv 012) ... reduce it with a reason-coded credit memo"
    edit a line amount / delete a line                     REFUSED  (same message)
    edit customer_notes / internal_notes / payment_terms_label  ALLOWED
    2. after the refused edits                             2150 4000.00 | open Net 4000.00 | TIES
    3. short-pay reserve side DR 2150 / CR 1235            2150 3750.00 | open Net 4000.00 | BREAKS (unresolved)
    4. reason-coded credit memo (rate dispute) 250.00      2150 3750.00 | open Net 3750.00 | TIES
    lock after the write-down (3,750 still open)           still held by FP-2026-00001 — releases when the account closes
- FOR CC-1 / CURSOR (ROUND 336 lanes): an edit path that tries an amount change on a factored invoice gets SQLSTATE 23514 with message prefix "factored_invoice_amount_locked:" — surface it verbatim; the read endpoint above lets the UI disable the amount fields up front.

## Q-9 — red factoring/Faro guards re-measured on prod — 30 red → mine all green (2026-10-02)

Re-ran all 167 factoring/Faro guards. 30 red. Disposition:
- **Fixed — guard drifted behind a ruled change (20 guards, each live PASS + selftest PASS):** poster-secured-borrowing (1235 `factor_cash_reserve_held`, ROUND 296), advances-write-role-gated (retired writer 410 / Owner-only `voidPurchase`, #24015/#24166), void-enumerates-all-postings, pledge-nets-credit-memos (shared `INVOICE_PLEDGE_CENTS_SQL`), summary-dollars-unit, liability-reserve-column, batch-wizard-qbo-chrome, faro-tabs-real-data (B5 order, B7 shared reserves panel), vendor-merge-banner-deeplink (FIX-DVB135), surface (ROUND 24.6), submission-queue-routed + wave-b connectivity (/factoring/submit → /factoring/submit-invoice, #24002), advance-drawer-linkage (#23919), chargeback-invoice-customer-reverse (ACCT-F26015), fact-dual-02/03, submit-canonical-factor-rates (ACCT-F10370), tab-submit-factor-picker, invoice-detail-url-sort.
- **Fixed — real defect:** the load Factoring tab linked to `/banking/factoring?load_id=` — a tab deleted in ROUND-20.8 B3 (#21962). Now links to `/factoring/payments-to-you?load_id=`, and PaymentsToYouPanel filters by the URL `load_id` (reverse link restored). `accounting.list` restored as a Required reverse_link leaf.
- **Fixed — nested boxes in my banking files:** WriteCheckForm (3), DriverEscrowBoardSection (1), DriverEscrowLedgerSection (3), ReconciliationTabContent (5). The inner `rounded*` was dropped and the border kept (FactoringHome precedent).
- **Honest, not defects:** faro-invoice-lines-load-linkage (exit 75, empty by purge); faro-repurchase-price-ties-to-statement (UNVERIFIED pending a Faro statement); usmca-book-equals-faro-and-alwaystrack (data state).
- **OTHER LANES — please take:**
  - CC-3: `verify-catalog-factory-coverage` — blocked_feature_flags, cash_flow_adjustment_reasons, driver_tags, lane_mileage, point_mileage are unregistered.
  - Dispatch: `verify-factoring-package-metadata-failures-caught` — LoadDetailDrawer Email-package / Mark-uploaded `persistPackageMeta` needs a `.catch()`.
  - CC-1: `verify-posting-prepaid-factoring-register-human-labels` — AbandonmentQueuePage is missing entityLabel. `verify-invoice-pipeline-proforma-to-factoring` — delivered_pending_docs must convert the proforma.
  - Nested-box ratchet (`verify-no-nested-box`, which also turns `verify-factoring-nested-box-baseline` red): DriverSamsaraDuplicateBanner (1), PmCostPerMilePanel (2), ThreeMileCpmPanel (2), TruckLineBoard (1).
  - `verify-surface-bar-modal-inventory`: driver-finance AddPayLineModal has no required.json leaf.
- Noted: SubmitFactoringModal has no opener (`setSubmitOpen(true)` absent) — unreachable; the canonical writer is the Submit Invoice tab.
- Also fixed: WriteCheckForm.test.tsx failed 3/3 on main (no Router/Toast/Company context) — now 3/3 green.

## ROUND 341 item 1 — the twenty-guard ledger (#24273), proven both ways on the REAL source

Method: fresh worktree at origin/main d85d8923b1. For each guard: run it clean, PLANT the regression into the real source
file, run it, RESTORE the file, run it again; then its own selftest. Harness: scratchpad `ledger-harness.mjs`. Every
ruling was resolved to the commit that changed the code (`git log -S` on origin/main), not to my own comments.

**Two plants ESCAPED on the first run — real holes, both fixed in this PR:**
- `chargeback-invoice-customer-reverse`: my `{0,900}` widening let the SQL rationale comment ("i.customer_id, no cast")
  satisfy the regex after the projection itself was deleted. Now SQL `--` comments are stripped and the gap is
  whitespace-only (`\s{0,200}`); a selftest plant comments the projection out and must fail.
- `poster-secured-borrowing`: the allowlist scanned only `resolveRoleAccount("role")`; a role added as a leg literal
  `{ role: "x", debit_or_credit }` escaped (pre-existing hole, found by this plant). Both paths are now scanned; the
  self-test plants an un-ruled role on each path.
**Four of my comment citations were WRONG and are corrected:** dual-03 (said "#24021-era", is #23956), role-gated (said
#24015/#24166, is #24002), summary-dollars-unit (said #24015/#24166, is #23951), batch-wizard (cited nothing, is #16385).
**summary-dollars-unit had NO selftest** (my earlier "self=0" was the live run ignoring the flag) — it now has one.

| # | guard | BEFORE asserted | NOW asserts | ruling (commit that changed the code) | plant on real source → clean / planted / restored / selftest |
|---|---|---|---|---|---|
| 1 | fact-dual-02-submit-rates-from-factor | modal reads advance_rate + reserve_rate + fee_rate from activeFactor | reserve_rate + fee_rate from activeFactor (advance is derived) | ACCT-F10370 FACT-RESERVE-01 step 3, d327e46f27 (advance_rate_pct no longer a caller input) | reserve rate not read from factor → 0/1/0/0 |
| 2 | fact-dual-03-routes-resolve-canonical-factor | summary = `withCanonicalFactorIdentity(summary.row ?? fallback, …)` | same, or the row spread with the book-reserve override inside the identity wrap | ACCT-F9329 ROUND 326.2 item 4, #23956 (one book-reserve engine) | identity wrap removed → 0/1/0/0 |
| 3 | factoring-advance-drawer-linkage | drawer renders EntityLink kind="bank_transaction" itself | directly OR via OnlineBankingMatchBanner fed matched_bank_transaction_id | BANK-F31517-B1F, #23919 | matched wire not passed → 0/1/0/0 |
| 4 | factoring-advances-write-role-gated | all 6 write routes call requireVoidCancelExecutorWired | each route has a gate: that, OR the retired-writer 410, OR Owner-only voidPurchase | ACCT-F9331 one purchase engine, #24002 | all three gates stripped → 0/1/0/0 |
| 5 | factoring-batch-wizard-qbo-chrome | `<Modal … onClose={onClose} title="Deactivate active factor"` | `onClose={\w+}` (local wrapper allowed; still the real Modal) | BANK-F6691 ConfirmModal fire-and-forget class, #16385 | Modal → div → 0/1/0/0 |
| 6 | factoring-chargeback-invoice-customer-reverse | lateral projects `i.customer_id::text AS customer_id` | `i.customer_id` (uuid), SQL comments stripped, whitespace-only gap | ACCT-F26015, #21169 (text = uuid 500 on the customer filter) | projection deleted → 0/1/0/0 (ESCAPED before fix) |
| 7 | factoring-invoice-detail-url-sort | every `{key,label}` block is a sortable column | menu actions (`onSelect:`) are not columns; data columns still need sortable | VOID-BUTTON-01, #22497 | Description loses sortable → 0/1/0/0 |
| 8 | factoring-liability-reserve-column | listFactors joins factoring.v_factor_reserve_balance | listFactors calls factoringBookReserveCents( | ACCT-F9332 reserve readers → one engine, #24015 | second ledger call → 0/1/0/0 |
| 9 | factoring-pledge-nets-credit-memos | routes file itself joins credit_memo_applications | the ONE shared INVOICE_PLEDGE_CENTS_SQL nets credit memos and routes import it | ACCT-F26060 FACT-DELIVERED-AUTO, #21575 | netting removed from the shared def → 0/1/0/0 |
| 10 | factoring-poster-secured-borrowing | 7-role allowlist (resolveRoleAccount literals only) | + factor_cash_reserve_held; leg-literal roles scanned too | ACCT-F20260926G4C owner ruling GL 1235 own pool, #22838 | un-ruled role → 0/1/0/0 (ESCAPED before fix) |
| 11 | factoring-submission-queue-routed | /factoring/submit renders `<SubmissionQueue />` | /factoring/submit stays mounted and redirects to /factoring/submit-invoice | ACCT-F9331 one purchase engine (batch queue retired), #24002 | SubmissionQueue remounted → 0/1/0/0 |
| 12 | factoring-submit-canonical-factor-rates | modal defaults advance rate from activeFactor.advance_rate | reserve + fee from activeFactor; no advance input | ACCT-F10370, d327e46f27 | reserve hardcoded → 0/1/0/0 |
| 13 | factoring-summary-dollars-unit | no `reserve_balance … /100` anywhere (substring) | same, but the field must stand alone (escrow_/cash_reserve_balance are cents) | ACCT-F9328 ROUND 326.2 item 3, #23951; KPI engine `unit: "cents"` (factoring-kpi.service.ts:155) | bare reserve_balance/100 → 0/1/0/0 (selftest NEW) |
| 14 | factoring-surface | top nav ≤ 6, no top-level spread | ≤ 16: 15 Faro tabs (one `...SUBNAV.map(`) + Internal Tools; any other spread fails | ROUND 24.6 revert of the 16→6 consolidation, #22082 | 17th tab → 0/1/0/0 |
| 15 | factoring-tab-submit-factor-picker | block ends at "Confirm Submit" | ends at "Confirm Submit" or "Open Submit to Factor"; still Combobox+allowAddNew, never bare select | ACCT-F9331, #24002 (tab's batch writer retired to a link) | Combobox → select → 0/1/0/0 |
| 16 | factoring-vendor-merge-banner-deeplink | merge_from/to_vendor_id = from/to_qbo_vendor_id; "unsynced" fallback | survivor/duplicate = TMS vendor ids; no qbo_vendor_id; two-click keep-from/keep-to | FIX-DVB135 Round 27.1 step 5.7, ACCT-F20260921 #22136 (0/618 USMCA vendors have a QBO id) | QBO id back in the merge → 0/1/0/0 |
| 17 | factoring-void-enumerates-all-postings | the impl body itself enumerates all lifecycle JEs | follows the impl's delegation to reverseFactoringAdvanceEventInClientTx and audits that body | ROUND 119 item 1 ACCT-F2026092319, #22425 | funding-only lookup → 0/1/0/0 |
| 18 | faro-tabs-real-data | 15-item order incl. account_summary + request_debtor_credit_check; Reserve tab binds history inline | B5 order (those two under Internal Tools; escrow_account + cash_reserve after Reserve); Reserve mounts the shared panel which binds the ledger | ACCT-F31504 #23900 (B4–B5), ACCT-F31512 #23907, ACCT-F31507 #23902 | second reserve view → 0/1/0/0 |
| 19 | load-factoring-advance-banking-reverse-section | load tab links /banking/factoring?load_id=; BankingHome filters by load | load tab links /factoring/payments-to-you?load_id=; PaymentsToYouPanel filters by it | BANK-F30080 ROUND-20.8 B3 deleted that Banking tab, #21962 — the CODE was the defect here and was fixed in #24273 | load filter dropped → 0/1/0/0 |
| 20 | wave-b-factoring-banking-drivers-connectivity | /factoring/submit → SubmissionQueue; /factoring/batches/new → BatchWizard | both redirect to /factoring/submit-invoice | ACCT-F9331, #24002 | BatchWizard remounted → 0/1/0/0 |

No row is unsourced, so no guard goes back red. Row 19 is the one where the code, not the guard, was wrong.

## ROUND 342 Phase 4 — the OR leak: three duplicate tenant_id policies dropped (migration 202615310600, claimed #24286)

**Prod BEFORE (pg_policy, 2026-10-02):** two PERMISSIVE policies per table (OR'd):
customer_factor_assignment: `…_opco_scope` (operating_company_id) + `…_tenant_scope_v2` (tenant_id) · factor: `factoring_factor_opco_scope` + `factoring_factor_tenant_scope_v2` · letter_of_release: `factoring_letter_of_release_opco_scope` + `factoring_lor_tenant_scope`.
**Prod data (bypass):** rows 1,222 / 2 / 0; operating_company_id NULL 0 / 0 / 0; tenant_id ≠ operating_company_id 0 / 0 / 0.

**WRITER — found before dropping anything:** `factor.service.ts` INSERTs into `factoring.factor` and
`factoring.letter_of_release` set **tenant_id only**; they passed RLS only through the duplicate tenant policy's
WITH CHECK. Dropping the policy first would have made every new factor / letter of release fail. Diff: both INSERTs now
set `operating_company_id = $1` (same company as tenant_id). customer_factor_assignment already did (FACT-ASSIGN-05).

**Fork br-steep-mouse-akhv3537 (parent br-fancy-credit-akjnd07a), DELETED after:**
- pg_policy AFTER: exactly one per table — `…_opco_scope`. Migration applied twice; second apply no-op.
- Non-bypass session (`SET LOCAL ROLE ih35_app`, `SET LOCAL app.bypass_rls=''`, `is_lucia_bypass()` printed = f):
  USMCA sees 1,222 / 1 / 0 before and after; TRANSP sees 0 / 1 / 0 before and after.
- factor OLD writer (tenant_id only) → `new row violates row-level security policy for table "factor"`;
  FIXED writer → INSERTED; cross-carrier (USMCA session writing TRANSP) → refused.
- letter_of_release OLD writer → refused; FIXED writer → INSERTED.
- Instrument note: one intermediate run was contaminated by my own session-level `SET app.bypass_rls` leaking through
  the pooler; every proof above was re-run with bypass explicitly cleared and printed.

**GUARD:** `scripts/verify-factoring-one-scope-policy.mjs` (registered in money-pr-local-gate) — static: all three
writers set operating_company_id, migration drops all three; live: one policy per table, on operating_company_id, none
on tenant_id. Selftest 5/5. Positive controls: LIVE FAIL on prod before deploy (2 policies each); static FAIL on
origin/main's factor.service.ts (two writers without the column). Exit states 0 / 1 (structural, not data-dependent).

**→ CURSOR (blocks every seat's gate):** `verify-migration-no-number-collision` FAILS on main for everyone:
`202615312200_r342_entity_code_company_scoped.sql` is stamped in the prod ledger (maxLedger=202615312200) but the file is
on no branch — only its claim landed (#24287). DDL reached prod ahead of its merged file. Land the file.
**→ CC-2 queue (my lane, found in this gate run):** `verify-void-is-whole` — 130 of 323 USMCA fuel purchases have an
all-dead ledger but a live header (no voided_at / void_reason / voided_by_user_id). Silent voids. Queued after Phase 2.

## ROUND 342.2 — Phase 4 CLOSED on prod (#24288, migration 202615310600, claim #24286; backend dep-db04c249v7es739sh83g live 00:06:01Z)

1. Assertions inside the migration: the pre-arm DO block (NULL or tenant ≠ opco, all three tables) returned 0 — the
   migration applied (it RAISEs otherwise). Re-measured on prod after: factor 0 · customer_factor_assignment 0 · letter_of_release 0.
2. pg_policy: BEFORE 2 each (`…_opco_scope` + `…tenant_scope_v2` / `factoring_lor_tenant_scope`, measured on prod 23:56Z)
   → AFTER 1 each: `factoring_customer_factor_assignment_opco_scope`, `factoring_factor_opco_scope`, `factoring_letter_of_release_opco_scope`.
3. Non-bypass USMCA session on prod AFTER (ih35_app, `is_lucia_bypass()` = f): customer_factor_assignment 1,222 · factor 1 · letter_of_release 0.
   BEFORE on prod I measured under bypass only (1,222 / 2 / 0); the non-bypass BEFORE/AFTER pair is from the fork
   (1,222 / 1 / 0 both). Identical.
4. `count(*) FROM pg_policy WHERE pg_get_expr(polqual, polrelid) LIKE '%tenant_id%'` = **21** after (the Lead's 24 before; I did not measure 24 myself).
Guard `verify-factoring-one-scope-policy` live exit 0.

## ROUND 342 Phase 2 — step 1: the WRITERS (this PR). Nothing dropped yet.

**Real set = 17 tables**, not 15: B1 = 5 (both NOT NULL / CHECK-equated); B2 = **12** (the round lists 12 under "(10)").
Prod (bypass): rows / opco NULL / disagree — only insurance.payment_schedule has a NULL (1); 0 disagreements anywhere.

**The null row is test junk, not a real schedule:** payment_schedule c929cb4e… belongs to policy `POL-TESTMTDQ164H`
(cancelled), which the project's own purge (`run-usmca-seat-junk-purge-once.mts:474`, `policy_number ILIKE 'POL-TEST%'`)
classifies as seat junk; the purge cancels the policy but never touches its schedule. No bill, no late fee, no money.
The other schedule is under `SAMPLE-POL-5743-SIMPLE` (cancelled). insurance.payment_schedule holds 0 real rows.

**The writer:** 23 INSERT statements reach the 17 tables; 2 still omitted operating_company_id —
`insurance/payment-schedule.routes.ts` (POST /api/v1/insurance/payment-schedule) and `insurance/refund-obligation.service.ts`.
Both now set `operating_company_id = $1` (same company as tenant_id). Fork br-autumn-meadow-ak8woqmh (deleted), non-bypass:
OLD payment_schedule writer → `new row violates row-level security policy` (every normal request has been refused);
FIXED → INSERTED with USMCA. Same for refund_obligation. Under bypass the OLD writer → INSERTED with `opco_is_null = t` —
exactly how c929cb4e was born. (claim.routes.ts sets the column dynamically via put() when it exists — it does.)
**Guard:** `verify-opco-gated-inserts-set-opco` now covers all 17 tables (adds the 3 Phase-4 factoring tables + 4 B1
tables); baseline 10 → 1 (7 entries were already fixed and never removed; claim.routes.ts kept with its reason).
Selftest 9/9 incl. the verbatim null-producing INSERT. Its old selftest asserted the 3 factoring tables must NOT be
listed — superseded by Phase 4 (#24288), now inverted.

**Phase 2 plan — expand / move code / contract (why not one transaction):** tenant_id is wired into 30 indexes (7
unique business keys), 17 FKs to org.companies, 7 RLS policies (4 of them the ONLY policy on a B1 table:
mx_permits, mx_tolls_ledger, internal_labor_log, customer_terms_history — drop the column and that table has RLS on with
no policy), 1 view (factoring.v_factor_reserve_balance), the incoming composite FK from canonical_factor_agreements,
and ~60 backend files (insurance.policy alone: 32). Render runs the migration BEFORE the new code serves, so dropping
tenant_id in the same deploy as the code change fails every old-code request in the window. Steps:
 2a migration: per table assert 0 disagree → backfill opco from tenant_id (count) → SET NOT NULL → FK opco → org.companies
    → an opco twin of every tenant index, unique ones included, **uq_factoring_factor (operating_company_id, id) for
    CC-1's same-entity FK** → opco policy replacing each tenant-only B1 policy → tenant_id DROP NOT NULL → view on opco.
 2b code: every reader / ON CONFLICT target moves to operating_company_id; writers stop writing tenant_id.
 2c migration: drop tenant_id + its CHECKs / FKs / indexes — only after **CC-1 confirms in writing** (i) the
    coi_request sync trigger is dropped and (ii) canonical_factor_agreements' composite FKs are on (operating_company_id, …).

**"Always red" — decisions in writing:**
- verify-purge-era-closures-still-hold: BASELINED — REPORT-ONLY by owner ruling ROUND 213 (2026-09-28), gate line 1123.
  Clears when the owner seeds / imports.
- verify-usmca-book-equals-faro-and-alwaystrack: BASELINED — REPORT-ONLY by Lead 2026-10-01 (owner seeding freeze),
  gate line 1278. Which side is non-zero: the Faro side is NOT the database — it is `FARO_AGING_TARGETS`, a constant
  transcribed from the owner's AGING REPORT.csv ($298,762.00 over 82 rows); the book side is $0.00 because USMCA has no
  factored invoices under the freeze. A book population of zero is NO DATA → owed: exit 2, queued with the three-state work.
- verify-factoring-reserve-escrow-subledger-gap, verify-fuel-card-gl-subledger-traceability (red in the static step,
  my lane): OPEN — CC-2 queue, after Phase 2.

## ROUND 342 Phase 2 step 2a — EXPAND (migration 202615310700, claim #24294). Nothing dropped.

Per table, in one transaction: assert 0 disagreements (RAISE → whole migration rolls back) → backfill operating_company_id
from tenant_id → SET NOT NULL → FK operating_company_id → org.companies (13 B2 tables had none) → tenant_id DROP NOT NULL.
Then an operating_company_id twin of all 30 tenant_id indexes (unique stays unique), the four tenant-keyed policies
replaced by the same rule on operating_company_id, and post-conditions that RAISE if anything is left.

**Fork br-rough-breeze-akn9h1mi (parent br-fancy-credit-akjnd07a), DELETED after. Applied twice; second apply a no-op.**
- Assertions: disagree = 0 on all 17. Backfill per table: **insurance.payment_schedule 1**, every other table 0.
- Row counts (bypass) identical before/after on all 17 (customer_factor_assignment 1,222 · policy_unit 63 · claim 8 ·
  policy 8 · factor 2 · lawsuit 2 · payment_schedule 2 · coi_request 1 · refund_obligation 1 · internal_labor_log 1 · rest 0).
- Non-bypass (ih35_app, `is_lucia_bypass()` = f): TRANSP identical before/after. USMCA identical on 16 tables;
  **insurance.payment_schedule 1 → 2** — the backfilled row (child of the cancelled seat-junk policy POL-TESTMTDQ164H)
  is visible again. That is the only visibility change, and it is the intended one.
- Policies reading tenant_id on the 17 tables: 4 → 0 (mx_permits / mx_tolls / internal_labor_log `*_tenant_isolation`
  and `customer_terms_history_tenant_scope` → `*_opco_isolation` / `customer_terms_history_opco_scope`; on those tables
  both columns are NOT NULL and CHECK-equal, so the rule is the same rule). Nullable operating_company_id: 12 → 0.
- **CC-1 ordering:** `uq_factoring_factor_opco_id` UNIQUE (operating_company_id, id) built. Simulated CC-1's Phase 1 on
  the fork (rename canonical_factor_agreements.tenant_id → operating_company_id; repoint
  `canonical_factor_agreements_profile_same_entity_fkey` to factor(operating_company_id, id) — the vendor same-entity FK
  follows the rename on its own). A USMCA agreement pointing at TRANSP's factor, **under bypass** →
  `violates foreign key constraint "canonical_factor_agreements_profile_same_entity_fkey"`; the same agreement pointing at
  USMCA's own factor → INSERTED. The structural guard survives the move.
- 2am check: the old tenant-only INSERT now fails LOUDLY even under bypass (`null value in column "operating_company_id"
  … violates not-null constraint`) instead of writing an invisible row; no writer in the code has that shape (scan, #24293).
  The step-2b shape (operating_company_id only, tenant_id omitted) INSERTS.
**GUARD:** `scripts/verify-r342-opco-canonical-on-double-scoped.mjs` (money-pr-local-gate) — selftest 5/5; positive
control on prod BEFORE deploy: LIVE FAIL "12 nullable; 4 policies read tenant_id; 30 untwinned indexes; CC-1 target missing".
**→ CC-1 (in writing, for 2c):** the target your same-entity FK needs exists after this deploys: `uq_factoring_factor_opco_id`
on factoring.factor (operating_company_id, id). I will not drop tenant_id from factoring.factor (or anything) until you
confirm (i) trg_coi_request_sync_operating_company_id + its function are dropped and (ii) both canonical_factor_agreements
same-entity FKs are on (operating_company_id, …).

## ROUND 342 Phase 2a — first prod apply FAILED and rolled back; corrected and re-rehearsed with the real runner

Backend dep-db04or1h83ns73chph90 (#24297): `pre_deploy_failed` 00:33:21Z — `Migration failed: constraint
"internal_labor_log_operating_company_id_fkey" for relation "internal_labor_log" already exists`. The file is one
transaction: prod verified unchanged after (12 tables still nullable, no twin index, the payment_schedule NULL still NULL,
202615310700 absent from _system._schema_migrations). The running service was never affected (pre-deploy failed → the
previous deploy kept serving).
ROOT CAUSE: my "FK already exists?" check compared `pg_get_constraintdef()` text to 'org.companies(id)'. The runner
(scripts/db-migrate.mjs) sets search_path to `mdata, …, org, …, maintenance, …`, so the def printed `companies(id)` —
mismatch → ADD → collision. My fork rehearsals ran through plain psql (default search_path), which hid it.
FIX (same file — never applied, so the ledger has no checksum to break): `SET LOCAL search_path TO pg_catalog, public`
inside the transaction, and the FK check is structural (referenced table + conkey) or by constraint name.
RE-REHEARSED with the REAL runner on fork br-red-glade-ak6eb8b0 (deleted after), in prod mode
(`PROD_MIGRATE_BLOCKLIST=<fork host> ALLOW_PROD_MIGRATE=1`) so the 9 held migrations are skipped exactly as on Render:
pass 1 `APPLY 202615310700 … Migrations applied successfully`; pass 2 skipped it. Same before/after as the psql
rehearsal (tenant policies 4 → 0, nullable 12 → 0, 30 twins, 17/17 FKs to org.companies, USMCA payment_schedule 1 → 2,
everything else identical). `verify-r342-opco-canonical-on-double-scoped` LIVE PASS against the migrated fork.
## ROUND 342 Phase 2 step 2b — every READ of tenant_id on the 17 tables moved to operating_company_id (ships only after 2a is live)

Scope: 44 backend files reference both one of the 17 tables and tenant_id (285 occurrences). Each occurrence was judged
by which table its alias belongs to. Moved: every WHERE / JOIN / ON / ON CONFLICT on the 17 tables (≈186 occurrences);
SELECT outputs became `operating_company_id::text AS tenant_id` so no API field name changes in this step. Left on
purpose: INSERT column lists (tenant_id still written until 2c — the coi_request sync trigger and CC-1's FK need it);
every tenant_id on the rename-only tables (mdata.assets, insurance.type_catalog, factoring.canonical_factor_agreements,
accounting.bill_unit_allocation) — on a join between the two, only the in-scope side moved (reviewed line by line, e.g.
`JOIN mdata.assets a ON … a.tenant_id = pu.operating_company_id`). Removed: every `COALESCE(x.operating_company_id,
x.tenant_id)` fallback (they existed only because the column could be NULL — 2a made it NOT NULL), and two duplicate
`tenant_id = $n AND operating_company_id = $n` predicates (the operating_company_id one kept).
`factoring/company-scope.ts` factoringCompanyScope now returns the operating_company_id predicate only (it had 0 callers).
**Guards** — 330 guards read these files. 53 red against the 2b tree; run against clean main, 44 are red there too
(pre-existing), and their output diff shows 2b added exactly one new failure line (scenario-tracker accident token) —
fixed. The other 9 were red ONLY because of 2b; each pinned the old tenant_id SQL; each now requires the same scope on
operating_company_id (superseded by ROUND 342 + migration 202615310700), each live PASS + selftest PASS:
verify-bill-detail-linked-identity-human-labels (its selftest had escaped on MAIN — `.replace` on a token that occurs 3×;
now replaceAll + a new claim-scope plant, 5/5), verify-claim-economics-slice2 (INVERTED: it required the COALESCE
fallback "or pre-backfill rows drop" — 2a backfilled; a tenant_id fallback is now the plant), verify-customer-coi-uses-
paritytable, verify-damage-auto-claim-explicit-company-scope (counts the predicate, not its AND/WHERE prefix — 3 on main,
3 now), verify-insurance-coi-policy-reverse, verify-insurance-lawsuit-policy-reverse, verify-insurance-policy-type-human-
label (type_catalog side stays tenant_id), verify-insurance-profile-reverse, and **→ CURSOR:** your
`verify-r342-dual-scoped-factoring-reads` required COALESCE(operating_company_id, tenant_id) — rewritten to forbid that
fallback (2a made the column NOT NULL; 2c drops tenant_id) while keeping your canonical_factor_agreements exclusion;
selftest 4/4; positive control: FAIL on main naming company-scope.ts and batch.service.ts.
Tests: backend tsc clean (combined 49 files); insurance + factoring + damage-continuity + mexico-ops + internal-labor
suites 39 files / 276 tests pass; resolve-purchase-rate.test.ts (red on MAIN: mock row had no company) fixed.
**→ CC-1:** `accounting/__tests__/invoice-send-delivery-evidence-backfill.test.ts` fails to load on main (its
`../shared.js` vi.mock lacks companyQuerySchema) — your lane.
**Watch for 2c:** mx_tolls / mx_permits / internal_labor INSERTs `RETURNING *` — their responses lose tenant_id when the
column drops; any FE reading it must move first.
**Overlap with Cursor #24295 / #24298 (same files, landed while 2b was in flight):** Cursor swept the same factoring and
insurance reads to the TRANSITIONAL `COALESCE(operating_company_id, tenant_id)`. Rebased: every conflict hunk resolved
to the canonical form, every non-conflicting Cursor hunk kept; `insurance/company-scope.ts insuranceCompanyScope` now
returns the operating_company_id predicate only (0 callers); `verify-r342-dual-scoped-insurance-reads` rewritten like its
factoring twin — forbids the fallback, keeps Cursor's type_catalog + mdata.assets exclusions, selftest 4/4, FAILS on
main. #24298 also put that COALESCE on insurance.type_catalog and mdata.assets, which have NO operating_company_id —
policy create / update and the coverage-gap report errored once it deployed with 2a (01:30:53Z); hotfix #24304
(ACCT-F2989) + guard verify-no-opco-filter-on-tables-without-it (table list live from information_schema).
**→ CURSOR:** please stop sweeping the double-scoped tables — ROUND 342 assigns them to CC-2; two seats on the same
files produced the type_catalog / assets regression above.

## verify-void-is-whole — the "131 fuel silent voids" were 130 false findings + 1 real one (not fuel)

Measured on prod (bypass): 207 fuel_event ledgers are all-dead. 77 have no fuel.fuel_transactions row (orphan JEs, all
reversed). The other **130 have a live fuel header — and all 130 have a linked accounting.expenses row
(expenses.source_fuel_transaction_id), unvoided, with a LIVE expense JE**. Their fuel_event JEs were reversed on purpose:
113 "R-153.6/153.7 remediation: fuel wrongly credited to 1090 … Voided to repost through the fixed writer", 10 "E22 …
create the EXPENSE like QuickBooks", 5 "ROUND 145.1 owner ruling — fuel.fuel_transactions never carries its own journal
entry; fuel cost posts only through its linked accounting.expenses row". The fuel cost IS on the books; the guard read
only the fuel_event ledger. FIX: for fuel purchases the ledger = own postings + the linked expense's postings (selftest
plants the branch's removal). After: fuel purchases 323 docs · 321 with a ledger · **0 all-dead**.
What remains is **1 real Direction-1 silent void: mdata.loads 13515** (ledger 3 dead / 0 live, header carries no
voided_at / void_reason / voided_by_user_id) — dispatch lane; it is the same load verify-usmca-book-equals-faro names.
**→ LEAD (written decision, per ROUND 341):** the guard still files that one under EMPTY BY PURGE because its purge window
never expires (`expires null`). With the false 130 gone it is ONE named finding, not "no data" — recommend closing this
guard's purge window so it FAILS and the load gets a queue number. Not changed here: the window mechanics gate every seat.
**→ OWNER-ATTENTION (unowned, from prod logs 01:30–01:37Z):** `owner/todays-attention/aggregator.service.ts:539` selects
`maintenance.predictive_alerts.predicted_failure_date`; the column is `projected_failure_date` (42703 on every tick, worker
and the owner route). Introduced #635 (2026-06-06).

## ROUND 347 — 2c preconditions re-measured by me · the purge window closed for void-is-whole · 13515 handed off

**2c preconditions (prod, bypass=lucia, 2026-10-03 01:56:17Z; catalog reads — RLS cannot mask them):**
`coi_sync_trigger_still_present = 1` (and the function `insurance.coi_request_sync_operating_company_id` = 1);
`canonical_factor_agreements_profile_same_entity_fkey (tenant_id, factor_profile_id) → factoring.factor(tenant_id, id)`,
`canonical_factor_agreements_vendor_same_entity_fkey (tenant_id, factor_vendor_id) → mdata.vendors(operating_company_id, id)`,
`canonical_factor_agreements_tenant_id_fkey (tenant_id) → org.companies(id)`. **NOT met — 2c HELD.** I will re-measure when
CC-1 reports, not take the report.
**Item 4 (the NULL writer):** already fixed and live — #24293 (payment-schedule.routes.ts + refund-obligation.service.ts
set operating_company_id; fork-proven: old writer RLS-refused, under bypass it wrote opco NULL). It ships again, re-proven,
with 2c.

**The purge window — what it WAS set to:** `purge_state.json` verified_at = 2026-09-28T04:52:00Z → by the 72-hour rule
it would have closed **2026-10-01T04:52:00Z**; but `seeding_freeze` (declared 2026-10-01T03:30:00Z, owner verbatim,
recorded by the Lead; `lifted_at: null`) makes `purgeWindow()` return `expiresAt: null` — open with no expiry. The freeze
branch was added in a92503c35e (2026-10-01). verify-void-is-whole was the ninth arm (ROUND 117: Direction 1 "transient
during a void run").
**What I changed it to:** verify-void-is-whole is REMOVED from PURGE_WINDOW_GUARDS (10 → 9) and no longer calls the
window helper — a Direction-1 silent void beyond the baseline is a HARD FAIL. The other nine arms are untouched: they
measure tables that really are empty under the freeze; this guard measures documents that exist. The baseline is NOT
widened (0 entries). verify-purge-window-exemption + verify-purge-window-state updated ten → nine.
BEFORE: `EMPTY BY PURGE … 131 NEW Direction-1 silent-void(s)` (exit 75; 130 false — fixed in #24308).
AFTER: `FAIL — 1 NEW Direction-1 silent-void(s) beyond the 0-violation baseline: loads|1-silent-void|44eae7f5…` (exit 1).
**13515 handoff:** board row `LOAD-13515-SILENT-VOID-2026100301` (docs/audit/GUARD-WORKORDERS.md), OWNER DISPATCH. Retired
under AUTH-201 (duplicate billing of 13513) — ledger reversed, header never stamped voided_at / void_reason /
voided_by_user_id. Not fixed by me (dispatch lane). Gate impact: red for every diff under accounting/ driver-finance/
factoring/ fuel/ db/migrations/ scripts/purge/ until that row closes.
## ROUND 335 item 2 — banking + factoring design parity against the approved preview (docs/approved-screens/4-Banking_Homepage.png)

Measured Banking home element by element against the preview (Feature 1 factoring virtual bank, Feature 2 driver escrow
visualizer, KPI strip, sub-nav), respecting later rulings (ROUND-20.8 B3 deleted Banking's Factoring tab). Built:
- **Dead links (same class as the load Factoring tab, #24273):** the factoring virtual-bank tile routed to /banking/factoring,
  which redirects to /banking — the tile landed back on Banking home. Now /factoring/reserve (the detail it summarises).
  The two "Banking entry" reverse links (advance detail, factoring hub) now target /banking directly. The redirect routes stay.
  3 guards that pinned the retired URL updated (ruling: #21962), each with a plant that the old URL must fail.
- **Placeholders removed (ROUND 326.2 "no placeholder panels"):** the factoring card's "Advances funded MTD — (see Factoring
  module)" and "+30 aging fees — (see Chargebacks & Fees)" now render the factoring KPI engine's month-to-date
  purchased_volume and default_interest_accrued (the same engine Factoring renders), a zero showing the engine's reason.
- **Driver escrow (preview Feature 2), engine first:** banking KPI engine + escrow_held / escrow_contributions /
  escrow_deductions over the escrow_liability_default account (2100) and every sub-account (recursive, 43 accounts), each
  with a drill sharing its predicate. Prod YTD: held $1,325.00 over 12 accounts holding escrow; contributions $8,925.00;
  deductions $7,600.00 (8,925 − 7,600 = 1,325 — self-consistent); MTD 0 / 0 with the engine's reason. The tie-out guard
  recomputes all three independently: **12 banking KPIs tie to the cent**; planted "root account only" → FAIL
  (engine 0 != ledger 132500). New DriverEscrowSummaryCard on Banking home (held · accounts holding · contributions MTD ·
  deductions MTD · Filter → /banking/driver-escrow); the three KPIs also appear (with drill) in the banking KPI panel.
- **Stale test, my lane:** FactoringDetailPage.mutationError.test.tsx failed on MAIN — it clicked "Mark Advanced", a writer
  retired by ACCT-F9331 (#24002). Rewritten: the retired writer must not be offered (plant showAdvance=true → FAIL) and a
  rejected Void (the remaining writer) surfaces a toast.
- **Not built, with reason:** the preview's "DIP balance" tile — DIP is TRANSP's Chapter 11 account; USMCA has none, and a
  tile without data would be a placeholder.
Guard: `verify-banking-home-preview-parity` (selftest 4/4; FAILS on main naming the placeholder, the missing escrow card
and the off-engine MTD).
**#24313 re-gate (my miss, corrected):** I merged #24313 on a background "exit 0" while the gate's own line said
gate_exit=1 — its only red was the intended verify-void-is-whole failure on load 13515, but the gate stops at the first red.
Re-run on the PR branch with only that guard stubbed: `gate_exit=0`, passed=227, failed=2 (the two documented REPORT-ONLY
checks). Nothing else was behind it.
- **Queued (my lane, found here):** the shared LedgerKpiPanel shows each KPI's `source` (internal schema.table names) to the
  operator as hover text and as the drill's "Source:" line, for all 22 factoring + banking KPIs. The static
  internal-language guard cannot see runtime strings. Next: business-language provenance in the engines + a runtime check.

## KPI provenance in business language (queued in #24317, done)

LedgerKpiPanel shows each KPI's `source` as hover text and as the drill's "Source:" line — 17 of the 22 factoring + banking
KPIs named internal tables / columns there (e.g. "accounting.factoring_purchases (posted, gross_cents)", "bank_transactions
review_state = for_review"). Rewritten in accounting language ("Posted factoring purchases — gross invoice value", "Bank
lines still in For Review", …). verify-no-internal-language-in-prod-ui scans frontend literals and cannot see these runtime
strings, so a new guard runs both engines read-only and checks every label / source / empty_reason / GL label:
`verify-kpi-provenance-business-language` — PASS 22/22; selftest 4/4; FAIL on main naming each leak. Engine tests 11/11.
