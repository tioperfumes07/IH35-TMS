# Neon apply recorded — `202608070000` escrow forfeit sign + flag

**When:** 2026-07-25 (owner hand-apply)  
**Branch:** `br-fancy-credit-akjnd07a`  
**File:** `db/migrations/202608070000_escrow_forfeit_posting_type_sign_and_flag_seed.sql`  
**sha256:** `eea3dc3be6bc58bcda168fd50e0c9b84897ce52a9c2cf602145fe65746a52b2f`

## Owner paste results (recorded)

### Box 1 — migration body
Statement executed successfully (BEGIN → ALTER CHECK → CREATE OR REPLACE function → INSERT flag → COMMIT).

### Box 2 — dual ledger backfill
Statement executed successfully (both INSERTs).

### Box 3 — verify (lucia)
- `fn_has_forfeiture`: **true**
- `posting_type_check`: includes `deposit|release|adjustment|forfeiture`
- `DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED`: `default_enabled=false`, `rollout_pct=0.00`
- `in_system_ledger`: **true**
- `in_ih35_ledger`: **true**

## Independent GUARD re-proof (same day)
Neon MCP re-query: `fn_has_forfeiture=true`, `else_raises=true`, flag OFF, both ledgers true.

## Not applied (and must not be fake-applied)
- `202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql` — intentional NO-OP until OWNER sets TRANSP/USMCA `account_number` values. Not a Neon blocker for escrow.

## Registry honesty
22 held files already on Neon ledgers but `applied_on_prod` unset were stamped true in the companion PR (disk sha256 matched live checksums). No additional SQL required for those 21.
