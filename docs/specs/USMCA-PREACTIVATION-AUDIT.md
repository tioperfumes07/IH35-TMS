# USMCA Pre-Activation Readiness Audit (CODER-16)

**Date:** 2026-06-28 (CDT) · **Scope:** confirm USMCA (`operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80`)
is fully hidden until the July-2026 launch; add minimal defense-in-depth gating if a gap is found.
**Constraint:** USMCA shares NOTHING with TRK/TRANSP; zero user-facing exposure before launch.

## Findings (code-level; live-DB items flagged for GUARD/Jorge per §1.5)

| Check | Result |
|---|---|
| **Entity exists** in `org.companies` | **Y (assumed)** — referenced as a canonical entity in `verify-multi-entity-separation` (`5c854333…`). *Live `is_active`/`deactivated_at`/seeded-data state needs a prod SELECT (gated) — flagged below.* |
| **Hidden by an explicit launch flag?** | **N (gap)** — `GET /api/v1/org/me/companies` and `GET /api/v1/org/companies` filtered **only** by `org.user_accessible_company_ids()` + `deactivated_at IS NULL`. There was **no explicit launch/visible gate**, so a mis-grant of USMCA access (or an un-deactivated row) would leak it into the company picker. |
| **Selector-excluded** (`CompanySwitcher` / `CompanyContext`) | The switcher renders whatever `me/companies` returns (`showSwitcher = companies.length > 1`). So exclusion depended entirely on the backend access-scope — no frontend safety net. |
| **Unscoped-query leak** | Entity data is isolated by `operating_company_id` RLS + filters (entity-independence law). No additional unscoped leak found in the company-list path. |

## Gating added (defense-in-depth, this PR)

`apps/backend/src/org/companies.routes.ts` — both company-list endpoints now drop not-yet-launched
entities **regardless** of access/deactivated state, behind a default-OFF flag:

```ts
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_ACTIVE = process.env.USMCA_ACTIVE === "1";
filterPreLaunchEntities(rows) // = USMCA_ACTIVE ? rows : rows without USMCA
```

- Applied to `GET /api/v1/org/me/companies` (the picker source) and `GET /api/v1/org/companies`.
- **Flip `USMCA_ACTIVE=1` at the July-2026 launch** to expose USMCA. Default OFF = hidden.
- Additive — only USMCA is filtered; TRANSP/TRK are always retained (proven by test).

**Guard:** `apps/backend/src/org/companies-usmca-hidden.routes.test.ts` — both endpoints exclude
USMCA while `USMCA_ACTIVE` is off, and still return TRANSP. Locks the hiding so it can't regress.

## Open items for GUARD/Jorge (live-DB, §1.5 — not run here)
1. Confirm `org.companies` USMCA row state on prod: `is_active`, `deactivated_at`, and whether any
   user has USMCA in `org.user_accessible_company_ids()`. (Belt-and-suspenders even if so — the new
   filter hides it regardless.)
2. Confirm no seeded USMCA operational data exists pre-launch (or is fully RLS-isolated).
3. At launch: set `USMCA_ACTIVE=1` (Render env) + grant access; remove this note.
