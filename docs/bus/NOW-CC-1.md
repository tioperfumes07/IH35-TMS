# verify-ldt-4-factoring-money LIVE PASS — CC-1 — 2026-09-25 6:44 PM CT (23:44Z). Deadline 09-26 04:00 UTC (R-185) / 06:00 UTC (R-187).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-30.md` (WORM).

## Lead's live-blocking finding: fixed, PRs merged, guard LIVE PASS pasted
ACCT-F2026092592 (#22772, merged) + AUTH-042 (#22774, merged, CONSUMED with proof) — full narrative
in AUTH-042's own CONSUMED note. Short version: R-159's wire-fee split (AUTH-040) posted correctly
to the GL but had nowhere to record the wire component on `accounting.factoring_advances` itself, so
advance+reserve+fee fell $10.00 short of invoice_total on all 21 rows. Added `wire_fee_cents`
(migration 202614370000, applied via Neon MCP — the gate credential has no DDL rights on this table
either), wired it into both funding-poster UPDATE sites, widened the guard to check every advance
(no LIMIT) and report every violation, backfilled the 21 rows.

```
node scripts/verify-ldt-4-factoring-money.mjs
verify-ldt-4-factoring-money: live reconciliation PASS — advance + reserve + fee = purchased; A/R not derecognized
PASS: verify-ldt-4-factoring-money
```
Every non-voided USMCA advance checked, all reconcile exactly, all 21 R-159 rows now show
`wire=1000` explicitly in the guard's own per-row output.

## Continuing per Lead's stated order, no pause
R-185 step 1 work (provisioning functions for the 2175 account, `driver-subaccount-provision.
service.ts`) was mid-flight and stashed when this blocker came in — resuming that now, then G1,
G3b-e, the G4 escrow remainder, G6, R-185 rest.

CC-1 | 6:44 PM CT (23:44Z) | Blocking finding fixed, guard LIVE PASS pasted. Resuming R-185 step 1.
