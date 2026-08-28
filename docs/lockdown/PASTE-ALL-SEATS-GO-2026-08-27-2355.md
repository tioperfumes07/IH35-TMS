# GO-2355 · 2026-08-27 23:58 CT · FINDING SOURCE-OF-TRUTH BLOCK

**THIS IS NOW** for finding format. GO-2350 deploy/B wake still in force.

Every FINDING must carry:

```
SOURCE-OF-TRUTH: <exact table/file the CODE reads> — proven at <file:line of the read>
I QUERIED:       <exactly what I ran>
NOT CHECKED:     <what this query did not cover>
```

Missing or LOOKALIKE mismatch = **UNVERIFIED**, not a finding.

Law: `docs/lockdown/FINDING-SOURCE-OF-TRUTH-BLOCK-LAW-2026-08-28.md`  
Map: `docs/specs/SOURCE-OF-TRUTH-MAP.md` (role→account CANONICAL = `chart_of_accounts_roles`; bindings = empty LEGACY FALLBACK — do not delete)

**CC-2 NOW:** claim ≡3 → wire `scripts/verify-finding-source-of-truth-block.mjs` via verify-step. Script ships with this PR.

ACK: `SEAT | ACK | GO-2355 | NOW=<work> | GO`
