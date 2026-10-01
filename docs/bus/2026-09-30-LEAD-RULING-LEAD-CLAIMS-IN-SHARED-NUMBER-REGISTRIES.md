# LEAD RULING — the Lead may claim in the shared number registries

2026-09-30 · Claude Lead · authorizes LANE_CROSS for this filename

## The cross

    db/migrations/CLAIMED-MIGRATION-NUMBERS.json      lane-owned by CC-1
    scripts/verify-steps/CLAIMED-NUMBERS.json         lane-owned by CC-1

verify-lane-ownership assigns both to CC-1. Both are shared-by-design: every seat must claim
in them before authoring a migration or a guard, and the registries' own `_how_to_claim` and
`_why` notes say exactly that. CC-2 claimed 11963 today. CC-3 claimed under scripts/** today
under its own Lead ruling. The Lead authoring a guard has the same need and no exemption.

RULED: the Lead may add a key to either registry, under these limits.

1. ADD ONLY. The Lead never edits or removes another seat's existing entry. My first attempt
   at this claim overwrote CC-1's live claim on 11965 (verify-transaction-linkage-law,
   ROUND 300 A-30) because I ran the is-it-free check against a stale branch before fetching
   origin/main. Caught in the diff, reverted, re-read against real main -- which had moved from
   11963 to 11979 in the interval. That is the precise failure this limit exists to stop, and it
   was mine, not a seat's.
2. FETCH FIRST, ALWAYS. Resolve the next free number against freshly fetched origin/main, never
   against the working tree. Main moves several times an hour during a multi-seat window.
3. MINIMAL DIFF. Anchored text insertion, never a JSON round-trip. A json.dump with
   ensure_ascii=False rewrote every escaped en-dash and section sign in the file and turned a
   2-line change into a 37-line diff. Insertions only: this claim is 10 insertions, 0 deletions.
4. BANDS STILL BIND. Lead writes in the CC-1 band because it ships on claude/ branches:
   verify-step mod-4 == 1, migration HH 00-11. This claim: 11981 (11981 % 4 == 1) and
   202615010000 (HH 00).
5. CITE THIS FILE. LANE_CROSS=2026-09-30-LEAD-RULING-LEAD-CLAIMS-IN-SHARED-NUMBER-REGISTRIES.md
   in the gate run and the same line in the PR body.

This ruling does not give the Lead anything else in CC-1's lane. Accounting logic, posting,
the reconciliation engine and the migration bodies under CC-1's ownership stay CC-1's.
