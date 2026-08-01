# WAVE-H1 — Short list of genuinely missing required CoA role bindings

**Neon branch:** `br-fancy-credit-akjnd07a`  
**Measured:** 2026-08-01 post-#3934 RLS bypass + GUARD binding integrity  
**Vocabulary:** `entity-required-roles.ts` / `COA_ROLE_VALUES` (not Cascade prose keys)

## Required-role coverage (active bindings only)

| Opco | Required count | Unbound **required** roles (active binding) |
|------|----------------|-----------------------------------------------|
| TRANSP | 26 | **NONE** — every required role has an active same-opco account |
| TRK | 15 | **NONE** — every required role has an active same-opco account |
| USMCA | 19 | **NONE** — every required role has an active same-opco account |

Orphan `account_id` across all 114 role rows: **0**. Distribution: TRANSP 37 / TRK 39 / USMCA 38.

## Qualification — inactive-only bindings (NOT required unbound)

TRK has **4** roles whose only binding is `is_active=false` (effectively unbound at runtime, but **not** in the TRK required set):

| Role | Required for TRK? | Disposition |
|------|-------------------|-------------|
| `damage_recovery` | No (carrier-driver / TRANSP+USMCA) | Correctly non-required for asset-holder TRK |
| `factor_reserve_default` | No (factoring TRANSP-only) | Correctly non-required |
| `factor_wire_fee` | No (factoring) | Correctly non-required |
| `accum_depr_default` | **No — OPTIONAL** | Explicitly in `OPTIONAL_COA_ROLES` with comment: *TRK seeds asset+expense; accum stays unbound until owner designates.* Latent gap tracked to **ND-FA-01** (fixed-asset / depreciation go-live). Not a H1 required-role FAIL. **Re-prove 2026-07-31 (lucia):** TRK row exists, `is_active=false`, account `c6cac1be-7400-454b-84d1-3569422d61cb` — **0-active**. Do **not** promote into H1 required guard. Activate only when owner designates for depreciation go-live (Desktop `ND-FA-01-OWNER-PRICES-REQUIRED-2026-07-30.md`). |

Do **not** claim “zero inactive gaps” — claim **“zero unbound *required* roles”** and name the ND-FA-01 latent for `accum_depr_default`.

## Guard 1910

`verify-wave-h1-catalog-coa-completeness` treats `is_active=false` as **UNBOUND** for required-role coverage (`activeBindingCoversRole`). Row existence alone does not pass. Selftest plants inactive-only → must FAIL cover.

**H1 action:** no new GL accounts created (Rule 19). Completeness guard fails CI if any *required* role lacks an **active** same-opco account.

**Catalog density (entity-scoped GUC — bypass-alone false-empties expense_categories):**

| Table | TRANSP | TRK | USMCA | H1 action |
|-------|--------|-----|-------|-----------|
| expense_categories | 3 | 3 | 3 | wire pickers (no re-seed) |
| escrow_types | 1 | 1* | 1* | already Lists-wired; EscrowForfeit uses deduction types |
| driver_deduction_types | 7 | 7* | 7* | already EscrowForfeit / Lists |
| cash_advance_types | 6 | 6 | 6 | **wire Create Advance only** (18 on Neon; seed already applied — do not re-seed) |
| parts | — | — | — | **OUT of H1** |

\*Same seed shape per opco under entity-scoped reads.
