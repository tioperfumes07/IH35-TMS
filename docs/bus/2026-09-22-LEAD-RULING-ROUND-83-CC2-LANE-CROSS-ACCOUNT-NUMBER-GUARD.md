# LEAD RULING — ROUND 83 — CC-2 LANE CROSS GRANTED: account-number-hidden verify guard

Committed on the Lead's behalf, quoting his own written packet
(`~/Downloads/09-22-2026-ALL-SEATS-ROUND-83-ACCOUNT-NUMBERS-HIDDEN-ITEMS-CARRY-QUANTITY.md`,
`ALL SEATS — ROUND 83`, 2026-09-22) which assigned this work to CC-2 by name and explicitly asked
for a new `scripts/verify-*.mjs` guard — CC-1's lane per LANES.md, crossed here the same way Round
56-A crossed E8/E11-D3.

**GRANTED, verbatim, per the Lead's own Round 83 packet, "CC-2 — ROUND 83 — HIDE ACCOUNT NUMBERS
APP-WIDE, AND ITEM LINES CARRY QTY x RATE":**

> A. ACCOUNT NUMBER VISIBILITY. Default OFF everywhere... Build it once, centrally — a single
> display helper / context that every account render goes through, not 40 per-page edits...
> GUARD: a verify that fails if any account-rendering surface prints account_number outside
> the helper, and a UI check that the default render shows name only.

**Scope of this grant:** CC-2 may author, wire, and claim verify-step numbers for exactly one
guard — `scripts/verify-account-number-hidden-by-default.mjs` (+ its `.baseline.json`) — and
nothing else in CC-1's lane. The guard backstops Round 83 Ruling 1 (owner, verbatim: "I DO NOT
LIKE TO SEE THE ACCOUNT NUMBERS SHOWING ANYWHERE. AUTOMATICALLY HAVE THEM OFF, IN FILTERS ADD
OPTION TO SHOW"), an explicit, named, written CC-2 assignment — not a verbal grant relayed
secondhand, unlike Round 56-A's E8/E11-D3 (which needed this same landing-in-a-visible-file step
for a different reason: the Lead's own chat-only ruling never reached a `docs/bus/` file at all).
This file exists so `verify-lane-ownership.mjs` can see the grant the same way every other
lane-cross in this repo is recorded.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
