# INBOX-CC-1 · CURRENT ROW · 2026-09-02 16:23 CT

`git pull --ff-only origin/main`

Owner: `docs/bus/OWNER-ORDER-STOP-PURGE-BUILD-ENGINES-2026-09-02.md`
Miles: `docs/bus/MILES-SPEC-DISPATCH-FINAL-2026-09-02.md`
FAST-MERGE: `docs/bus/FAST-MERGE-4MIN-LAW.md`. Never POST. Never seat fixtures.

**You own `driver_finance` + dispatch miles/settlement.** Cursor stays off those schemas.

## NOW

```
CC-1 — BUILD THE MILES + SETTLEMENT ENGINES. PURGE IS BACKGROUND.

1. Store three numbers per load: miles_shortest, miles_practical, miles_deadhead. Never derive.
2. Two settlement lines: (shortest × rate_loaded) + (deadhead × rate_empty). rate_empty own per-driver field; equals loaded today; do not hardcode.
3. Deadhead COMPUTE from truck last delivery, ALL entities. Never lane empty. Unknown = BLANK.
4. Deadhead on the pickup load, not the delivered load.
5. Guard: reconcile deadhead to previous delivery or flag. Flag short>practical OR reverse >100mi. Never block book.
6. Do not "fix" catalog short>practical or the 2.9% settlement gap.

THEN Wave 1 A1 interchange data + N1 load→expense. Then GO-22a LOAD counter.

Bank 395 stay uncategorized. Fake match bills/expenses: void later, not this PR. Escrow leftovers: between builds only.
```

ACK `CC-1 | ACK | miles+settlement engines now · purge background · NEVER POST | GO`
