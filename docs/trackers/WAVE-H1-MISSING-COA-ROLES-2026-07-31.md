# WAVE-H1 — Short list of genuinely missing required CoA role bindings

**Neon branch:** `br-fancy-credit-akjnd07a`  
**Measured:** 2026-07-31 (entity-scoped + lucia)  
**Vocabulary:** `entity-required-roles.ts` / `COA_ROLE_VALUES` (not Cascade prose keys)

| Opco | Required count | Unbound required roles |
|------|----------------|------------------------|
| TRANSP | 26 | **NONE** |
| TRK | 15 | **NONE** |
| USMCA | 19 | **NONE** |

All required roles already designate existing `catalogs.accounts` rows under the same `operating_company_id` (0 bad/wrong-opco FKs).

**H1 action:** no new GL accounts created (Rule 19). Completeness guard `verify-wave-h1-catalog-coa-completeness` (1910) fails CI if any required role becomes unbound or points at a missing/wrong-opco account.

**Catalog density (entity-scoped GUC — bypass-alone false-empties expense_categories):**

| Table | TRANSP | TRK | USMCA | H1 action |
|-------|--------|-----|-------|-----------|
| expense_categories | 3 | 3 | 3 | wire pickers (no re-seed) |
| escrow_types | 1 | 1* | 1* | already Lists-wired; EscrowForfeit uses deduction types |
| driver_deduction_types | 7 | 7* | 7* | already EscrowForfeit / Lists |
| cash_advance_types | 0 | 0 | 0 | **seed + wire Create Advance** |
| parts | — | — | — | **OUT of H1** |

\*Same seed shape per opco under entity-scoped reads.
