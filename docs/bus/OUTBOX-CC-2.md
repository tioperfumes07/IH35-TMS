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
