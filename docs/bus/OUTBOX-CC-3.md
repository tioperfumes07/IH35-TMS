# OUTBOX-CC-3 · working log (archive older: `docs/bus/archive/OUTBOX-CC-3-2026-09-01.md`)

CC-3 | ACK | NOW=Check ZIP 183 Option-1 load_stops.postal_code · never geography · autofill false | GO

CC-3 | 183 Check ZIP result | 183 · 0 observed ZIP · 0 multi-ZIP listed · 183 still empty · autofill still false · PR#19XXX (docs only, no seed write -- nothing observed to write). Ran Option-1 exactly as specified: mdata.load_stops.postal_code, delivered single-stop, USMCA (5c854333-6ea5-4faa-af31-67cb272fef80), lucia RLS bypass, prod tiny-field-89581227/br-fancy-credit-akjnd07a. USMCA has exactly 1 load total (L-20260901-0001) and it is CANCELLED, not delivered -- zero qualifying rows exist, not a sampling gap. Whole-DB count (both opcos, post GO-11 purge): 6 loads/12 stops. Filed an INFO row on GUARD-WORKORDERS.md (not a defect -- the packet's own "do not invent" rule anticipates this exact null outcome) noting lane-mileage-usmca.csv's 3,375-row history did not come from live mdata.load_stops (never carried that volume here) -- it's an external/offline dataset, and the app's own learning loop has nothing to build on yet. No geography lookup used, no default ZIP invented, autofill_allowed untouched (stays false on all 183).

LEAD | FORCE | NOW=Check ZIP 183 Option-1 `mdata.load_stops.postal_code` | #19414 63/63 DONE | #19419 Option 1 LAW | never geography | autofill stays false | NEVER AskQuestion | NEVER #19305 | GO

CC-3 | ACK | NOW=city-alias-review.csv 63 pairs | GO

CC-3 | city-alias-review.csv DRAINED | decided 63/63 (60 MERGE + 2 KEEP SEPARATE + 1 REJECT), 0 remaining. Decision + Canonical + Note columns appended to db/seeds/city-alias-review.csv, each verified against real US Census/USPS place names for that state, not guessed (e.g. TARHEEL/50 runs merges to "Tar Heel" not "Tarheel" despite the count -- count never overrides the real place name; LAREDP/LARED -> Laredo flagged as highest operational value given this is the company's own USMCA hub). 2 pairs are genuinely different real places (East Chicago/West Chicago IL; North Brunswick/South Brunswick NJ), kept separate. 1 pair rejected -- "AVE SHREVEPORT"/"AVE SHREVEORT" LA is a malformed address fragment, not a city, not a valid merge target. Filed 2 OPEN board rows routed=CC-1 (seed owner): a state-suffix-strip regex gap (no-separator case, e.g. "VADNAIS HEIGHTSMN") and the malformed-address-fragment row, both on GUARD-WORKORDERS.md. No Neon/seed PR from me this unit -- applying these decisions to lane-mileage-usmca.csv (re-aggregating any now-duplicate lanes) is CC-1's per GO-16 Rev B SEAT ORDER ("CC-1: Schema, seed... Seed committed with it"); I did not invent a merged mileage statistic without the raw per-load data to recompute a real median from.

FORCE NOW | READ INBOX-CC-3 | NOW=city-alias-review.csv 63 pairs (GO-16) | NEVER #19305 | GO

CC-3 | ACK | GO-14 | leftover GO-04/06 | GO

CC-3 | GO-04/06 none leftover | IDLE unless unique 2026-09-01 | GO

CC-3 | search result | Only candidate found: VERIFY-STATIC-37-UNBASELINED-GATED-FAILS (docs/audit/GUARD-WORKORDERS.md line ~9) — real, hit it myself this session too, but already logged twice today (CC-2 + my own earlier 01:15 CT capture) so not unique/new. Added corroboration row: 4 of CC-2's 36 confirmed real on a clean origin/main worktree (not baseline-staleness), 1 more (verify-load-column-all-module-remainder) is a CRASHING guard not a real product regression — cheap standalone fix if anyone wants it. No net-new unique 2026-09-01 leftover in my lane. IDLE.

CC-3 | GO-14 leftover check | GO-04 (#19309 eqclass/KPI class boxes, FleetTablePage.tsx:127 live on main) and GO-06-ish (#19308 cancelled-WO exclusion, verify-maintenance-recent-activity-range PASS live on main) both confirmed genuinely live, not just merged-in-diff — no rebuild, no leftover found for CC-3. Also shipped this session: GO-05 wave 1 (#19364, 6 raw tables → ParityTable, 3 guards rewritten) merged to main. Holding on option-1 scratch per GO-14/GO-13 TOP.
