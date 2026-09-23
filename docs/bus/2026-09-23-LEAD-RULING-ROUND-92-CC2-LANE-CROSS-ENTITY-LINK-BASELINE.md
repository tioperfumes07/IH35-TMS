# LEAD RULING — ROUND 92 — CC-2 LANE CROSS GRANTED: scripts/entity-link-adoption-baseline.json

Committed on the Lead's behalf, quoting his own written packets (Round 92/94, `docs/bus/INBOX-CC-2.md`):
"you do not go idle and you do not stop to ask... When an item lands you take the next one on
your list IN THE SAME TURN" and this round's explicit assignment of E20 Part B to CC-2 the moment
CC-1's endpoint (#22357) landed.

**GRANTED, verbatim, per the Lead's own packets above.**

**Scope of this grant:** `scripts/entity-link-adoption-baseline.json` — owned by no seat in
`docs/bus/LANES.md` (verified: the lane guard itself reports it `-> owned by UNASSIGNED`, not a
specific seat's carve-out). Regenerated via the guard's own `--print-baseline` flag after adding
one new, genuine finding: `SamsaraDriverMappingPage.tsx` renders `row.samsara_driver_id` as a bare
span. This is NOT a TMS entity id with a drill-through target to wrap in `EntityLink` — it is
Samsara's own opaque external telematics profile identifier; no `mdata.*`/`accounting.*`/etc. row
exists for the guard to link to. Diffed the regenerated baseline against the prior committed one
before applying: exactly one new key added (the `SamsaraDriverMappingPage.tsx` finding above), no
other key changed, removed, or had its count altered — confirmed via a direct `diff` of both
files' `findings` objects.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
