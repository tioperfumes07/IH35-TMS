# LEAD RULING — GATE-SCOPE-03 (CC-2 lane cross on `scripts/money-pr-local-gate.mjs`)

Self-discovered while pushing FILTER-MULTI-01, same class as GATE-SCOPE-01/02 (both owner-directed,
both fixed by CC-2 this session): `scripts/money-pr-local-gate.mjs`'s four remaining 03c-style
checks (`verify-control-totals`, `verify-alwaystrack-parity`, `verify-diesel-expense-fuel-dedupe`,
`verify-fuel-relay-txn-vendor-unmatched`) still used the literal pattern
`if (process.env.DATABASE_URL || touchesXPath())` — GATE-SCOPE-01's own REMAINING note had already
named two of these ("the fuel-relay-txn-vendor-unmatched guard's `DATABASE_URL || touchesMoneyPath()`
... NOT touched — out of scope for that commit") as an unaudited instance of the identical bug.

Reproduced live: a pure `apps/frontend/**` diff (FILTER-MULTI-01, zero accounting/fuel/migration
paths touched) with a real `DATABASE_URL` set failed `verify-diesel-expense-fuel-dedupe` on an
unrelated live-data mismatch ("expected 2 known settlement-5782 rows, found 0") — the exact "blocks
every seat regardless of their own diff" class GATE-SCOPE-01 and GATE-SCOPE-02 both already fixed,
now confirmed present a third time in the same file.

Owner's own standing instruction on this bug class, restated verbatim across both prior rounds:
"Fix the mechanism, not the files." This ruling authorizes CC-2 to apply the identical,
already-established fix pattern (gate purely on the diff-derived `touched` flag; a touched domain
with no `DATABASE_URL` still fails closed per ROUND 29.9-B, never a silent skip) to these four
remaining call sites in `scripts/money-pr-local-gate.mjs` (CC-1 lane). No guard logic weakened —
verified via `verify-purge-window-exemption.mjs` (still finds all 4 named EMPTY-BY-PURGE sites) and
a real end-to-end run of `money-pr-local-gate.mjs` against the FILTER-MULTI-01 diff (PASS, all
fuel/money-domain checks correctly skipped, zero guard behavior changed for a diff that actually
touches money/fuel).
