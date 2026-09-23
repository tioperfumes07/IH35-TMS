# FEED FINDING — the 34-document AlwaysTrack extract does not cover loads 13590-13616

**Filed:** CC-3, 2026-09-23, ROUND 137 item 4 (owner-directed write-up)
**Applies to:** the day-1 AlwaysTrack re-seed / re-feed
**Severity:** must be known before feed day, not discovered on it

## The finding

`data/alwaystrack/settlements-truth-2026-09-13.json` — the ground-truth extract the re-seed reads
from (`scripts/ops/settlement-truth-target.mjs`) — covers exactly 34 settlement documents:
5769-5803, minus 5782 (genuinely absent from the file, not a numbering error). Those 34 documents
name 76 distinct loads.

Live production (`fuel.fuel_transactions`, `fuel_type='diesel'`, `archived_at IS NULL`) carries
258 diesel rows as of this check (moving — active fuel remediation is ongoing; the owner's own
earlier-cited 254/$153,429.88 was a slightly earlier snapshot of the same moving number). Of
those:

- **23 rows / $11,059.27** carry no `load_id` at all — Faro-side/unattached purchases, can never
  appear in any load-based settlement document.
- **104 rows / $68,253.34** are on load numbers 13529, 13576, 13578, 13581-13583, 13585,
  13587-13616 — entirely OUTSIDE the 34 documents' own 76-load set. Purchase dates run
  2026-09-10 through 2026-09-21, i.e. at or after the ground-truth file's own 2026-09-13 capture
  date.
- 131 rows are on the 76 target loads themselves, vs. the ground truth's own 171-row figure for
  those same loads — a real shortfall, very likely explained by today's own concurrent fuel
  remediation (archival/reversal activity happening while this was measured), not confirmed as a
  separate defect. Not chased further — isolating cause-by-write during active concurrent
  remediation risks stepping on in-flight work; worth re-checking once fuel remediation is done.

## What this means for feed day

**This is not real diesel going missing from the rebuilt books.** It is diesel purchased on loads
whose settlement documents simply postdate or fall outside this one 34-document snapshot. If the
day-1 re-seed feeds ONLY these 34 documents, loads 13590-13616 (and the handful of gaps inside the
original 13497-13589 range) will have real, live diesel purchases sitting in
`fuel.fuel_transactions` with no settlement document to reconcile them against — not wrong data,
just an incomplete feed.

**Action needed before feed day:** pull a newer/wider AlwaysTrack extract that covers loads
13590-13616 (settlement documents likely numbered above 5803, not yet in
`settlements-truth-2026-09-13.json`), or explicitly scope day-1 to the original 34 and name
13590-13616 as a known, deliberate day-2 follow-up. Either is fine — the point of this finding is
that the choice gets made on purpose, not discovered as a surprise gap after the feed runs.

## Cross-reference

Full investigation, live query evidence, and the intra-set 131-vs-171 note: `docs/bus/OUTBOX-CC-3.md`,
"ROUND 137 items 1-3" section, item 3. Seed-truth harness used to derive the 76-load target set:
`scripts/ops/settlement-truth-target.mjs` (`--write <path>` emits all 34 documents' six target
dimensions as one JSON file for a preflight check to read directly).
