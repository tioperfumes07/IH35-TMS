# LEAD RULING 2026-09-23 — ROUND 125-128 — CC-1 cross into `apps/backend/src/governance/**` (UNASSIGNED lane)

**Authorization basis:** the Lead's own ROUND 125/126/128 messages, verbatim, assigning this exact
build to CC-1 by name:

> CC-1 — BUILD THE MISSING CALLERS. There is no seventh engine and you will not write one.
> reverseJournalEntryNoFlip already accepts ANY posted JE id... FUEL RULE, OWNER'S WORDS: "WE HAVE
> THE FUEL BANK TRANSACTIONS, THEY ARE DIFFERENT. WE MATCH." Voiding a fuel expense RELEASES the
> bank match and NEVER touches the bank transaction. postVoidReversal already does the release
> (BANK-ORPHAN-01). Reuse it.

And ROUND 125: "VOID A LOAD → EVERYTHING VOIDS... ADD FUEL to it" (the cascade in
`dispatch/cancellation.service.ts`, which dispatches through this same governance executor map).

**What crossed:** `apps/backend/src/governance/void-cancel-executors.ts` —
`verify-lane-ownership.mjs` reports this path as `UNASSIGNED` in `docs/bus/LANES.md` (no seat
currently owns it, same file already crossed once this session under the ROUND 117 ruling for an
unrelated fix — this is a second, separate touch, its own ruling doc per the session's convention
of one doc per distinct crossing reason).

**The fix:** added `executeFuelTransaction` (new) to the dispatch map, registered as
`entity_type='fuel_transaction'`. Calls `postVoidReversal(entityType:'fuel_event', entityId:<the
fuel_transaction's own id>)` for the GL reversal + BANK-ORPHAN-01 match release in one call, then
`stampDocumentVoided(family:'fuel_transaction')` for the header write only (never a hand-written
`UPDATE` — that column has a zero-tolerance named-writer allowlist, `verify-void-stamp-columns.mjs`,
R-102.1-A). Wired into `dispatch/cancellation.service.ts`'s load-cancel cascade
(`executeVoidCancel("fuel_transaction", ...)`) alongside the existing expense/bill/invoice steps.
Full detail in this round's own commit message (FINDING ACCT-F2026092325).

Per the session's established pattern for an UNASSIGNED-lane cross under a direct Lead order: this
doc + `LANE_CROSS=LEAD-RULING-2026-09-23-ROUND-128-CC1-GOVERNANCE-FUEL-EXECUTOR-CROSS-LANE.md` at
push + a matching `LANE-CROSS:` line in the PR body.
