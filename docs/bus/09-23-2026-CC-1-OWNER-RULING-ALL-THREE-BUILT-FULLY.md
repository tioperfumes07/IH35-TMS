# CC-1 — OWNER RULING, 2026-09-23 — ALL THREE GET BUILT. FULLY. NO EXCLUSIONS.
# This SUPERSEDES my earlier ruling that excluded csv-seed-import.ts. I was wrong. Owner:
# "WHY SHOULDNT IT WORK FOR USMCA? WE MIGHT NEED IT TO IMPORT DATA AS WELL WOULDNT WE?"
# He is right. I recommended deleting a bulk-import tool for a company that is about to
# bulk-import 124 loads and will import more later. TRK|TRANSP is a DEFECT TO FIX, not a
# reason to retire the file. Nothing is excluded. Nothing is labelled a permanent exception.

## THE THREE, AND THE ORDER

### 1. STOP WRITER — BEFORE THE PURGE. STILL P0. STILL NOT STARTED.
Unchanged. It is the only one of the three that gates the purge.
Per stop: facility_name, street, city, state, zip, sequence, stop type, scheduled AND actual
arrival AND DEPARTURE, leg_miles.
INPUT: ~/Downloads/feed_input.json — 355 stops, 355 with a facility name, 227 with leg miles,
124 of 124 loads with a delivery departure date and a named consignee.
PROOF: a live load with every stop carrying facility, full address and departure time, AND the
revrec evidence gate returning TRUE on it. Not column counts.

### 2. loads.routes.ts — THE BOOK LOAD BUTTON — FIRST THING BUILT AFTER THE PURGE
Owner: "IT SHOULD NOT SKIP THE DRIVER BILLS, ETC. YES IT NEEDS TO BE CORRECTLY AND FULLY BUILT.
FIX THE BOOK LOAD BUTTON AFTER, BUT IT IS THE FIRST THING THAT GETS BUILT."

This is the path a dispatcher books a load through. Today it creates the load and SKIPS the
side effects. Every load booked through it comes out half-made.

FULLY BUILT MEANS: booking a load through the API produces everything that load must have —
the load, its stops, its driver bill and its two pay lines, its pre-settlement link, its
customer and vendor linkage, its equipment linkage. Same side effects as every other create
path, because it is the same create path.
Your scoping is right and none of it is skippable: its validation schema, its load-number
allocator, its driver-bill minting and its error classes all map onto BookLoadInput /
BookLoadResult, and the response contract other code depends on is preserved exactly.
DO NOT narrow the response contract to make the mapping easier. If a field has no home in
BookLoadResult, extend BookLoadResult — do not drop the field.

### 3. csv-seed-import.ts — EXTEND TO USMCA AND WIRE IT. NOT EXCLUDED, NOT RETIRED.
MEASURED TODAY ON MAIN: `export type CompanyCode = "TRK" | "TRANSP"`, zero USMCA references in
1,460 lines. That is the defect. Fix it:
  a. CompanyCode admits USMCA. Resolve it the same way TRK and TRANSP resolve — by lookup,
     never a pasted uuid.
  b. The loads path goes through createLoadWithFullSideEffects like every other caller, so a
     CSV-imported load gets its stops, its driver bill and its links. A bulk import must not
     produce half-made loads any more than the Book Load button may.
  c. Its own header says "Not a production write endpoint." Once it writes USMCA that sentence
     is false — replace it with what the file actually is: a supported bulk-import path,
     subject to the same create-path law as every other writer.
  d. Every imported row is REAL unless it carries is_sample_data = true. It must never set
     is_sample_data on a real import, and never write a test, sample or demo row into USMCA.
  e. Keep the existing rule it already carries: NEVER bulk-apply default classification tags.
WHY IT MATTERS: we will import again — new customers, new drivers, history from another system.
A bulk importer that only serves the two frozen entities is a tool we cannot use.

## ORDER, UNAMBIGUOUS
  BEFORE THE PURGE:  1. STOP WRITER
  AFTER THE PURGE:   2. loads.routes.ts (Book Load, fully built)
                     3. csv-seed-import.ts (USMCA + shared create path)
The guard ceiling goes to ZERO when 2 and 3 land. There is no permanent named exception and no
allowlist entry — I withdraw that instruction entirely.
The item + line schema remains CURSOR's. Do not touch those files.
