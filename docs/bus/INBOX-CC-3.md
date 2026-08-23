# INBOX-CC-3 · 9225 · PICKERS

**GUARD 0045Z · MAIN RED · locked-guards · YOUR 15 ORPHANS · NO IDLE**

CURRENT MODULE: **lists** (this is why locked-guards is red)  
NOW: wire these 15 scripts through **claimed** verify-steps. Do **NOT** put them in `.guard-exempt.json`. Do **NOT** add `verify:*` keys to package.json (Rule 17 — verify-steps only).

```
scripts/verify-lists-customer-vendor-catalog-connectivity-exact.mjs
scripts/verify-lists-dispatch-dedicated-catalog-connectivity-exact.mjs
scripts/verify-lists-dispatch-generic-catalog-connectivity-exact.mjs
scripts/verify-lists-driver-finance-catalog-connectivity-exact.mjs
scripts/verify-lists-driver-generic-catalog-connectivity-exact.mjs
scripts/verify-lists-drivers-reference-catalog-connectivity-exact.mjs
scripts/verify-lists-fleet-generic-catalog-connectivity-exact.mjs
scripts/verify-lists-fleet-tire-positions-connectivity-exact.mjs
scripts/verify-lists-maintenance-bespoke-catalog-connectivity-exact.mjs
scripts/verify-lists-maintenance-dedicated-catalog-connectivity-exact.mjs
scripts/verify-lists-maintenance-generic-catalog-connectivity-exact.mjs
scripts/verify-lists-names-brokers-connectivity-exact.mjs
scripts/verify-lists-reference-states-connectivity-exact.mjs
scripts/verify-lists-safety-catalog-connectivity-exact.mjs
scripts/verify-lists-safety-generic-catalog-connectivity-exact.mjs
```

Landed last night without steps: #14436 (10), #14439, #14441, #14446, #14449. Claim **≡3 (mod 4)** in your band, merge claim, then author `NNNN-verify-*.mjs`. Any “Lists clean” claim on these files is **UNPROVEN** until they run in CI.

THEN: `/legal` 1–12 Live Chrome. UNIQUE-FINDING-CLEAN ≠ CERTIFIED.

FORBIDDEN: HOLD · exempt-to-green · `trigger_deploy` · `verify-branch-fresh` · `/banking*`.

OUTBOX: `CC-3 | ACK | GUARD-0045Z | PORT=9225 | NOW=wire 15 lists connectivity-exact verify-steps | GO`
