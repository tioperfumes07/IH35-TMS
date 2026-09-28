# ROUND 155.12 FIX 1+2(a)+2(b) DONE, ROUND 155.20 JOB 1 DONE, ROUND 155.23 NOT STARTED — CC-1 — 2026-09-28 10:10Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-15.md`.

PAUSED (per STANDING LAW, NOTHING GETS HALF BUILT): ROUND 155.12 FIX 2(c)/2(d)/FIX 3/FIX 4 and
ROUND 155.20 JOB 2/3/4 are paused mid-flight to ship what's done and move to ROUND 155.23 (owner
flagged it P0 — pre-settlement mixing closed money into an open one, active double-pay risk).
Will return to 155.12/155.20 remainder immediately after 155.23.

## ROUND 155.12 FIX 1 — DONE, live-proven
canonicalActiveLoadNotFinishedByMoneyCte treated an OPEN, unsettled driver bill as "finished
money" — a load gets billed AT DISPATCH, so this silently dropped every freshly-dispatched load
off every board. Fixed: requires `settled_in_settlement_id IS NOT NULL` on the driver_bills half,
requires the settlement_lines half to join to a `status='closed'` driver_settlements row.
countCanonicalActiveLoads: 16 -> 24 live, matching the order's own measurement exactly.
Guard scripts/verify-open-driver-bill-keeps-load-active.mjs: RED against the old predicate (both
static-shape assertions fail), GREEN live (8/8 open-bill-only loads correctly stay active).

## ROUND 155.12 FIX 2(a) — DONE
missingPayInputs/createDriverBillArtifacts/assertClosedLoadHasPricedDriverBill widened: refuse
only when NEITHER miles_shortest NOR miles_practical exists (was: shortest only). Document miles
(practical/loaded) is the real pay basis per the owner's own AlwaysTrack settlements;
miles_shortest is now correctly an optional variance signal, never the gate.
resolveDriverBasePayCents' own owner-locked (2026-09-04) practical-miles fallback was already
correct and untouched — only the gate in front of it was wrong.

## ROUND 155.12 FIX 2(b) — DONE, AUTH-091
Backfilled 110 of 312 active driver_finance.settlement_lines from the ALREADY-PARSED
feed-input/settlement-truth-from-pdfs.json (no new PDF parsing) — quantity/rate_cents/
unit_of_measure/item_id, every write verified quantity x rate_cents = the line's own real amount
first. 61 correctly left alone (30 where the DB line bundles extras beyond mileage pay — forcing
would violate the DB's own check constraint; 31 genuinely-zero deadhead legs with no source
figure), 13 JSON settlements have no matching closed DB row yet — none of these are inventable.
Guard scripts/verify-settlement-line-carries-miles-and-rate.mjs: shrink-only ratchet, baseline
ceiling 61, live PASS.

## ROUND 155.12 FIX 2(c)/2(d) — HONEST GAP, cannot close today
Checked whether any of the 110 backfilled lines touch the 24 currently-dispatched loads
(13609-13639): zero do. Those 24 have no real signed settlement document yet (6 have an open,
$0.00, no-source_document_ref settlement row; 18 have none at all) — there is nothing real to
backfill their OWN mileage from. FIX 2(a)'s gate widening does not unlock any of the 16 loads
still missing driver bills either: they have NEITHER miles_shortest NOR miles_practical captured
(confirmed live) — this is the same gap AUTH-090 already reported (Samsara has no historical
position data for these dates, only 2/18 rate cons state a mileage figure, PC*Miler/Trimble is
documented to always return null today). Not re-litigated; still true.

## ROUND 155.12 FIX 3, FIX 4 — NOT STARTED / IN PROGRESS WHEN PAUSED
FIX 4 (13618/13621's $0 gross bills): found BOTH loads already have real miles_shortest AND an
active driver_pay_rates row — the $0 is stale (bill minted before the rate existed). The real
correction path, void-open-driver-bill.service.ts's correctOpenDriverBillMileage, refuses both
because their existing settlement_lines are already is_active=false (a separate, real, unexplained
defect — not caused by anything in this round) with no voided_at set. Have not yet determined why
those lines are inactive or the safe fix; do not force through this without understanding it.
FIX 3 (12 TR-leg loads with no assigned_unit_id) — not started.

## ROUND 155.20 JOB 1 — DONE, AUTH-093
Owner: "I DO NOT HAVE 20 BOOKED LOADS IN ALWAYSTRACK... Any load you cannot tie to a source
document gets VOIDED." Re-verified all 18 AUTH-086/090 loads: full-text-scanned every one of 254
PDFs in Downloads for each load's own WO number (not a filename-pattern guess) plus every
filename. 14/18 PROVEN (own WO + own customer name both present in their own dedicated rate-con
PDF): 13622, 13624, 13626, 13628, 13629, 13630, 13631, 13632, 13633, 13634, 13635, 13636, 13637,
13639. 4/18 had ZERO real match anywhere: 13623 (WO 568871), 13625 (WO LGMX142), 13627 (WO
21868) — no document names any of these three strings at all, anywhere in Downloads; 13638's only
WO-string hit is a false positive (substring of an unrelated load's trailer number FB-56713 inside
old settlement PDFs). VOIDED all 4 via the real cancelLoad path (status='cancelled', driver bills
voided by the existing cascade, the 2 trailer_interchanges on 13623/13627 voided separately via
voidTrailerInterchange — that table postdates the cascade).

REAL BUG FOUND+FIXED while executing this: cancelLoadInClientTx's vendor-bill-void query was
`SELECT DISTINCT ... FOR UPDATE OF b` — Postgres refuses FOR UPDATE combined with DISTINCT in any
form, so load cancellation threw on EVERY call that reached this branch, for any load, before
today. Fixed with an EXISTS-scoped rewrite, same bills matched, no DISTINCT needed.
apps/backend/src/dispatch/__tests__/ : 212 passed, 4 pre-existing failures confirmed unrelated
(fail identically on stock main, no file overlap with this round's changes).

## ROUND 155.20 JOB 2/3/4 — NOT STARTED
Stamp-writer diagnosis (why actual_arrival_at/actual_departure_at are NULL on all 24 loads), the
10 delivered-but-still-dispatched loads' real status advancement, and "unchanged from 155.12" are
all still open. Returning to these right after 155.23.

## ROUND 155.23 — NOT STARTED, next
Pre-Settlement panel groups by driver+unit instead of tour_id, pulls a CLOSED load's money into an
OPEN pre-settlement's totals, 13614's stop data is internally inconsistent with its own mileage,
and 13609/13614 both show miles_shortest as an exact copy of miles_practical sourced from
'History' (same root cause as 155.12 FIX 2, now visibly paying a driver on it). Starting this now.
