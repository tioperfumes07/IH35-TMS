# GUARD proof packet (builder → GUARD)

Builders fill this. **They do not set `prod_verified`.** CC-2 (money) or Cascade GUARD-2 (non-money) stamps or rejects.

```
PROOF-PACKET
ITEM: <id>
MODULE: <sidebar module>
ENTITY: USMCA | TRANSP | TRK
HEALTHZ: <GET /api/v1/healthz/shallow version at time of proof>
ROUTE-OR-QUERY: <exact GET/path or SQL>
RESULT: <literal result — status, row, count>
CURRENT_USER: <from same Neon txn, or N/A-http>
DISCRIMINATOR: visible==n_live_tup | N/A-http | N/A-chrome
KNOWN-BAD: <row that must FAIL if the control is real, or N/A>
BUILDER: <seat>
```

GUARD: spot-check ≥1 fact. Then `prod_verified` + `live_verified_sha` + `live_verified_at` **or** reject with the missing field.
