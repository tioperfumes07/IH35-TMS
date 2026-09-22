# LANE_CROSS — CC-3 — FEED PARITY SHARED CREATE PATH — 2026-09-22

## Authorization

`docs/manuals/04-RULING-FEED-PARITY-THE-VERIFIED-SIDE-EFFECT-LIST.md` (Lead, 2026-09-22, committed
17:48:13 UTC) names this deliverable explicitly:

> **Deadline 2026-09-23 06:00 UTC. Surrender seat: CC-3.**

and its own guard section is credited `(CC-1)` for the eventual guard build, which the ruling text
itself specifies (`scripts/verify-one-load-create-path.mjs`). CC-3 is building both the extraction
and the guard under this same ruling's explicit, later, more specific "Surrender seat: CC-3"
instruction — per this session's own standing law, an explicit owner ruling on a specific
deliverable outranks a general lane assignment (`docs/bus/LANES.md` §0b: "DECISIONS → the OWNER
wins").

## Files touched outside CC-3's own `docs/bus/LANES.md` lane

1. **`apps/backend/src/dispatch/book-load.service.ts`** — `apps/backend/src/dispatch/**` is listed
   in `LANES.md` as **"OWNER DECISION PENDING"**, not a finalized CC-1 assignment (`LANES.md`
   line 59: *"assigns the dispatch surface to Cursor, who is not seated in this round... splitting
   it across `accounting/` and `dispatch/` as one fix with one canonical definition"* — i.e. the
   split itself is unresolved). Extracted `createLoadWithFullSideEffects(client, input, {source})`
   from what was `bookLoadInTransaction`'s inline body — a pure, behavior-preserving refactor
   (verified: `npx tsc --noEmit -p apps/backend/tsconfig.json` exit 0 before and after; all 11
   pre-existing non-DB book-load unit tests pass unchanged before and after). `bookLoad()` now
   calls it with `source: "live_feed"` — IDENTICAL behavior to before this PR for every existing
   caller. Added the two-case (`live_feed` / `historical_backfill`) gate-outcome plumbing the
   ruling specifies, applied to the 6 hard gates it names (unit OOS x2, unit dispatch-blocked, HOS
   violation, drug-program block, driver-qualification block) — `live_feed` (the fail-closed
   default) is byte-for-byte the old blocking behavior; `historical_backfill` records via the
   EXISTING `appendCrudAudit` trail and proceeds, never silently.

2. **`scripts/verify-one-load-create-path.mjs`** (new) and **`scripts/money-pr-local-gate.mjs`**
   (registration) — both `scripts/verify-*.mjs` and `scripts/money-pr-local-gate.mjs` are named in
   `LANES.md` as CC-1's lane generally. This ruling's own guard section names this exact guard by
   filename and assigns it to whoever ships this deliverable ("Surrender seat: CC-3" for the whole
   ruling, guard included).

## What is NOT claimed done (see the PR's own REMAINING / MODULE_PROGRESS)

The 4 real offender files the ruling itself named
(`integrations/edi/transactions/inbound-204.handler.ts`,
`mdata/loads.routes.ts`, `seed/csv-seed-import.ts`, `onboarding/seed-sample-data.ts`) still insert
into `mdata.loads` directly and have **not** been rewired to call
`createLoadWithFullSideEffects` in this PR — that is real, separate, per-caller work (each has its
own input shape to map onto `BookLoadInput`), named honestly rather than claimed complete.
`scripts/verify-one-load-create-path.mjs` is seeded as a **shrink-only ratchet at today's true
count (4)** for exactly this reason, matching the shape of
`scripts/verify-dispatch-reads-live-loads-view.mjs`'s own four-arm ratchet from the sibling
`02-RULING-LIVE-LOADS-VIEW` ruling.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Lv9avWehXBjdPLVwBdMsi1
