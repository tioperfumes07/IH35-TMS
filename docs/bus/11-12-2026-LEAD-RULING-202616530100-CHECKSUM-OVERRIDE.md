# LEAD RULING — 202616530100_usmca_card_payable_role_wiring.sql checksum override (11-12-2026 5:35 PM CT / 22:35Z)

**Facts (measured on production, `_system._schema_migrations`, br-fancy-credit-akjnd07a):**
- `202616530100_usmca_card_payable_role_wiring.sql` (CC-1 #29123) was applied 2026-11-12 22:24:25Z, ledger checksum `bafaefb75d1bbfed3cc61dac071717919d9e2ea748de0402ed8898928efea9c3`.
- As merged, it RAISEd EXCEPTION when USMCA accounts 2510/2520 are absent. Every database built from source (CI, DR restore, fresh branch) has no USMCA chart, so `security-audit`'s fresh migrate failed on every PR ("USMCA account 2510 (Dreamline Diesel Card Payable) not found").
- On production both roles are bound: `fuel_card_payable_dreamline` → 2510 and `fuel_card_payable_wex` → 2520 (read live ~22:35Z).

**Ruling:**
- The file now `RAISE NOTICE … RETURN`s when 2510/2520 are absent (disk checksum `f524732140f7fa3339e08283448f72a90dbcbb2d1e09015f466c41bbdd85907e`).
- Production is unaffected: the guarded file does exactly what the applied file did.
- The override in `scripts/lib/migration-checksum-overrides.json` is authorized by this ruling. Same treatment as 202616131600 (ruling 10-23-2026 443.292).

**Rule for every seat (ROUND 8.20):** a migration that needs production rows must skip with a NOTICE on a fresh database, and is tested on a fresh `ih35_verify` before push.
