# DESIGN — TONU / Cancellation → A/R linkage + Accessorial Chart-of-Accounts (HOLD)

> **STATUS: DESIGN ONLY · BUILD-AND-HOLD · DO NOT MERGE.**
> This document is doc-only. It contains **NO migration, NO money code, NO flag flip.** It is the
> planning artifact for a **future** implementation PR that will itself be a financial-cluster PR
> (`build-and-HOLD`, owner `JORGE-APPROVED` + owner Neon-apply required — Rule 13, `.cursor/rules/13`).
>
> - Branch: `design/tonu-ar-accessorial-coa-hold` (fresh from `origin/main`)
> - Author role: Planner (multi-agent orchestration, Rule 11). Builder / Financial-Accounting / GUARD
>   are **separate** agents on the future PR.
> - Spec sources: Rule 01 (`IH35_MASTER_BLUEPRINT_v3_FULL.md`, `IH35_UNIFIED_BLUEPRINT_ADDITIONS.md`,
>   `IH35_ARCHITECTURAL_DESIGN.md`), Law of the Land (`ARCHITECTURE-BLUEPRINT-2026-07-05.md`),
>   CPA locks (`.claude/skills/ih35-accounting-decisions`), never-delete law (`.cursor/rules/07`).
> - Doc-only exception: Rule 02 §Exception — this commit touches no code logic.

---

## 0. Problem statement (the trust defect)

A load can be cancelled with a **billable** cancellation charge (TONU — "Truck Order Not Used"), the
charge amount is **captured and displayed**, but it is **never billed**. There is no path from the
cancellation row to an invoice / A/R / GL. Money the company is owed silently evaporates. Separately, the
revenue chart-of-accounts cannot even represent TONU or a clean Accessorial breakdown — accessorial is a
single combined bucket and TONU has no account at all — so even if we billed it, it could not be booked to
a correct, auditable revenue line.

This is a **fix-not-patch** target (Rule 16): the root cause is a missing linkage + a missing CoA
structure, not a display bug. The correct fix ships **schema + code + roles + guard + live proof** in one
future PR, gated OFF by default, owner-applied.

---

## 1. Verified facts (evidence, not memory)

All DB facts below were re-verified on the Neon **prod** branch `br-fancy-credit-akjnd07a`
(project `IH35-TMS` / `tiny-field-89581227`) on 2026-07-21, under `SELECT set_config('app.bypass_rls','lucia',true)`
in the same transaction (FORCED-RLS 0-count landmine rule, `.cursor/rules/10`). Code facts cite files on
`origin/main` @ `60b69dc9d`.

### 1.1 Cancellation charge is captured but never billed
- `dispatch.load_cancellations` columns (prod): `id, operating_company_id, load_id, reason_code,
  cancellation_notes, billable_to_customer, cancellation_charge_cents (bigint, nullable), status,
  cancelled_by_user_id, cancelled_at, approved_by_user_id, approved_at, created_at, reason_code_id`.
  **There is NO `charge_id`, NO `invoice_id`, NO `invoice_line_id` FK.**
- `apps/backend/src/dispatch/cancellation.service.ts` (`cancelLoad`) writes
  `cancellation_charge_cents` into the row and emits an audit event
  (`dispatch.load.cancellation_requested` / `…_approved`). It **never** calls any invoice / A/R poster.
  The amount terminates in the dispatch table. → **Billable TONU is displayed, never billed.**

### 1.2 No TONU account; accessorial is a single combined bucket
- `catalogs.accounts` on prod has **no** TONU / "Truck Order Not Used" income account in any entity.
- Accessorial revenue is not broken out. Evidence:
  - **USMCA**: `4000 Freight / Line-haul Income`, `4100 Fuel Surcharge Income`,
    `4200 Accessorial / Detention Income` (one **combined** line for detention/accessorial).
  - **TRANSP**: `4100 Freight Revenue` (Income/SalesOfProductIncome) is the clean line; the rest are messy
    QBO-imported legacy income accounts (see 1.3).
- The invoice builder already *derives* accessorial/TONU line types but has nowhere clean to book them:
  `apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts` maps `line_type: "tonu"` →
  `revenue_code: "accessorial"` and `detention/layover/lumper` each to their own code, then resolves an
  account via `resolveAccountForCategory(opco, "revenue", code)`.

### 1.3 Messy legacy layover / lumper / accessorial income accounts (ARCHIVE — never delete)
Legacy QBO-imported revenue/expense accounts that overlap the accessorial space (Rule 07 — archive-relocate,
keep reachable; **do not delete**):

| Entity | Account # | Name | Type / Subtype | Note |
|---|---|---|---|---|
| TRANSP | `QBO-1150040184` | Sales-Income-From Layover, Shag, Extra Delivery, Escort Fee, Etc | Income / ServiceFeeIncome | catch-all accessorial income |
| TRANSP | `QBO-1150040160` | Sales-Warehouse-Lumper Fee-Income | Income / ServiceFeeIncome | lumper income |
| TRANSP | `QBO-130` | Billable Expense Income | Income / SalesOfProductIncome | generic billable passthrough |
| TRANSP | `QBO-60` | Deduction-For late PU/Delivery by Customer | Income / DiscountsRefundsGiven | contra-revenue, not accessorial |
| TRANSP | `QBO-24` | Uncategorized Income | Income / SalesOfProductIncome | dumping ground |
| TRANSP | `QBO-117` | Warehouse-Lumper Fee Expense | COGS / ShippingFreightDeliveryCos | expense side (not revenue) |
| TRANSP | `QBO-87` | Travel-Driver Layover Hotel Expenses | Expense / Travel | expense side (not revenue) |

These are **evidence of the mess**, not deletion targets. The future PR **relocates** them under the new
Accessorial parent as **archived** children (kept postable-reachable for historical drill-through) OR leaves
them in place with a documented mapping — **owner decides** (see §7). No `DELETE`, no `DROP`.

### 1.4 Primary role table
- The **authoritative** CoA-role table is **`accounting.chart_of_accounts_roles`** (per-opco `role → account_id`,
  soft-versioned via `is_active` + `updated_at`, audited). Confirmed by the resolver
  `apps/backend/src/accounting/coa-roles/resolver.service.ts` (`resolveMappedRoleAccount` reads
  `chart_of_accounts_roles` **first**), the admin routes `apps/backend/src/accounting/coa-roles/routes.ts`
  (GET/PUT `/api/v1/accounting/coa-roles`), and the admin page `apps/frontend/src/pages/accounting/CoaRolesPage.tsx`.
- `catalogs.account_role_bindings` is the **legacy** fallback (second in the resolver chain), then a
  last-resort `account_subtype` shape fallback. Control roles (`ar_control`, `ap_control`) **fail closed**
  when >1 candidate — this is the exact defense that fixed the "A/R debited to Unauthorized Expenses" bug.
- **Landmine:** the resolver's shape-fallback mis-types some roles (comment in `resolver.service.ts`:
  the old `factor_reserve_default` fallback mis-typed the reserve as a Liability; canonical
  `factor_reserve_held` is an Asset). This is why role designation must be **explicit** (owner-set), never guessed.

### 1.5 Revenue category map is currently EMPTY
- `accounting.expense_category_account_map` (columns: `operating_company_id, category_kind, category_code,
  account_id, posting_side, is_active, …`) has **zero active `category_kind='revenue'` rows** on prod
  (all entities). So the invoice-line revenue resolver (`resolveAccountForCategory(opco,"revenue",code)`)
  has **no explicit revenue mapping to resolve against today.** Any future billing path that relies on it
  must **seed** revenue mappings (owner-designated) — this is additive and part of the future PR.

### 1.6 Factoring reserve accounts — near-duplicates with inconsistent subtypes (SEPARATE owner ruling)
Prod `catalogs.accounts` where name ILIKE `%reserve%` (11 accounts; the "13+" estimate also counts
`%holdback%`/`%retainage%` variants):

| Entity | Account # | Name | Subtype (inconsistent!) |
|---|---|---|---|
| TRANSP | `1230` | Factoring Reserves | OtherCurrentAsset |
| TRANSP | `QBO-1150040080` | Faro Factoring Reserves | Savings |
| TRANSP | `QBO-248` | RTS-Factoring Reserves | Savings |
| TRANSP | `QBO-125` | Factoring Reserves Love's Solutions | CashOnHand |
| TRK | `QBO-105` | FR-Factoring Reserves- | OtherCurrentAssets |
| TRK | `QBO-106` | FR-Factoring Reserves-Ecapital | OtherCurrentAssets |
| TRK | `QBO-1152` | FR-Factoring Reserves-Love's | OtherCurrentAssets |
| TRK | `QBO-1499` | FR- Factoring Reserves- RTS | OtherCurrentAssets |
| TRK | `QBO-1201` | FR-Factoring Reserves. | Retainage |
| TRK | `QBO-4` | FR-Factoring Reserves | UndepositedFunds |
| USMCA | `1200` | Factoring Reserve / Holdback | Other Current Assets |

**Out of scope for this design** other than to flag it: any balance-sheet-moving reclassification of these
requires a **separate Jorge ruling** (subtype standardization + which are canonical vs archive). **Mention,
do not implement.** See §7.

---

## 2. Design — additive Chart of Accounts (revenue)

Additive only (Rule 07). Nothing is renamed or deleted. New accounts are per-entity (entity-scoped,
FORCED RLS). Numbering follows the existing `4xxx` income block where a clean block exists (USMCA/TRANSP),
using sub-numbers so the hierarchy reads cleanly in reports.

### 2.1 Target revenue hierarchy (per entity)

```
Sales of Service (parent, Income)
├── Linehaul / Freight Revenue — TRANSP (transport)
├── Freight / Line-haul Income — USMCA (transport, when USMCA launches)
└── Fuel Surcharge Income

Accessorial Revenue (parent, Income)
├── Detention Income
├── Layover Income
├── Lumper Income
├── TONU Income (Truck Order Not Used)        ← NEW, closes the cancellation gap
└── Other Accessorial Income
```

- **Sales of Service parent** covers the transport line for both TRANSP and USMCA (each entity keeps its own
  child freight line — TRANSP `Freight Revenue` / USMCA `4000 Freight/Line-haul Income`). USMCA children are
  seeded but stay hidden behind the USMCA launch gate (entity is hidden until launch — see entity facts skill).
- **Accessorial Revenue parent** splits the currently-combined USMCA `4200 Accessorial / Detention Income`
  into named children. `4200` itself is **kept** (never deleted) and relocated under the parent as the
  "Detention Income" child or archived with an explicit mapping — **owner decides** (§7).
- **TONU Income** is the new child that makes billable cancellations bookable.
- Legacy accounts from §1.3 are **relocated as archived children** under Accessorial Revenue (parent_account_id
  repointed, `deactivated_at` set where appropriate) so they remain reachable for historical drill-through but
  are not offered as default posting targets. **Owner confirms the archive mapping** (§7).

### 2.2 Account-shape rules (so the resolver + reports behave)
- `account_type = 'Income'` for all revenue children/parents; parents are **non-postable**
  (`is_postable = false`), children **postable**.
- `account_subtype`: standardize accessorial children to `ServiceFeeIncome` (matches existing accessorial
  income subtype on TRANSP) — **owner ratifies** the subtype standard.
- Entity-scoped: every row carries `operating_company_id`; parent/child within the **same** entity only
  (cross-entity parent = defect, Rule 14).

### 2.3 Migration shape (future PR — NOT in this doc)
- Idempotent `DO $$ … END $$;` with `IF NOT EXISTS` guards (Rule 04, financial-migrations skill).
- CREATE/seed-only additive rows into `catalogs.accounts`; **no ALTER/DROP** of existing financial tables.
- Because it touches `catalogs.accounts` (financial cluster), it is **HOLD**: built + validated on a
  throwaway PG (apply-twice), then **owner** applies on Neon and ledger-backfills; GUARD re-proves live.
  `ih35_app` cannot run DDL (Rule 10).

---

## 3. Design — Cancellation → A/R linkage

### 3.1 Additive schema (future PR)
Add nullable FK columns to `dispatch.load_cancellations` (additive; existing rows stay 0-impact):
- `charge_invoice_id uuid NULL REFERENCES accounting.invoices(id)` — the invoice raised for the TONU charge.
- `charge_invoice_line_id uuid NULL REFERENCES accounting.invoice_lines(id)` — the specific TONU line.
- (optional) `charged_at timestamptz NULL`, `charged_by_user_id uuid NULL` for audit symmetry.

Rationale for storing the FK on the cancellation row (vs only on the invoice): the cancellation is the
**source document**; forward drill (cancellation → invoice → JE → payment) and reverse drill
(invoice line → cancellation → load) must both resolve with a single join (Law-of-the-Land total connectivity).
`accounting.invoice_lines` already carries `source_load_id`; the TONU line additionally needs to point back
to the cancellation (mirror the `dispatch.stop_extra_rates.invoice_line_uuid` pattern already used by
`from-load.ts`).

### 3.2 Reuse the EXISTING invoice / A/R poster — write NO new GL math (Rule 13)
There is already a customer-invoice-from-load path; the TONU billing path **reuses** it:
- `apps/backend/src/accounting/from-load.ts` (`buildInvoiceFromLoad`) — creates
  `accounting.invoices` + `accounting.invoice_lines`, resolves the revenue account via
  `resolveInvoiceLineRevenueAccountId` → `resolveAccountForCategory`, recomputes totals, emits audit.
- The TONU path adds a `line_type: "tonu"` line (already a recognized type) whose `revenue_code` resolves to
  the new **TONU Income** account (via a seeded `expense_category_account_map` revenue row and/or the
  `chart_of_accounts_roles` revenue designation — see §4).
- GL posting reuses the existing posting engine (`postSourceTransaction` / invoice A/R poster). **No new
  journal-entry math is authored.** A/R control account resolves via the fail-closed `ar_control` role.

### 3.3 Feature flag — OFF by default
- A dedicated env flag, e.g. `TONU_CANCELLATION_BILLING_ENABLED` (default **OFF**, per-entity override only),
  gates the cancellation→invoice call in `cancellation.service.ts`. Flag OFF = today's behavior exactly
  (charge captured, not billed). Flag ON (per entity, after CPA sign-off + tie-out) = TONU raises an invoice.
- The flag flip to ON is itself a HOLD event (hold-merge-gate detects `*_ENABLED → true`).

### 3.4 Entity scoping + atomicity
- The invoice is created under the load's `operating_company_id` with `set_config('app.operating_company_id', …)`
  and the whole cancellation+invoice write is one transaction (lockstep INSERT, Rule 04). A cross-entity
  customer/account = defect.
- Idempotency: `buildInvoiceFromLoad` already returns the existing invoice for a `source_load_id` (no
  double-billing on retry); the cancellation FK is set exactly once.

### 3.5 Linkage matrix (forward + reverse — Law of the Land §9)

| From | To | Mechanism |
|---|---|---|
| `mdata.loads` | `dispatch.load_cancellations` | `load_cancellations.load_id` (existing) |
| `dispatch.load_cancellations` | `accounting.invoices` | **NEW** `charge_invoice_id` FK |
| `dispatch.load_cancellations` | `accounting.invoice_lines` | **NEW** `charge_invoice_line_id` FK |
| `accounting.invoice_lines` | `mdata.loads` | `invoice_lines.source_load_id` (existing) |
| `accounting.invoices` | `mdata.customers` | `invoices.customer_id` (existing) |
| `accounting.invoices` | `accounting.journal_entries` | existing invoice A/R poster |
| `accounting.invoice_lines` | `catalogs.accounts` (TONU Income) | `invoice_lines.account_id` via revenue resolver |
| all of the above | `audit.audit_events` | append-only audit on every mutation (existing helper) |

No dead-end screen, no orphan row: cancellation detail links to the invoice; invoice line links back to the
cancellation + load + customer + JE.

---

## 4. Design — Role designations via `chart_of_accounts_roles` (owner designates)

- The system **never guesses** the TONU / accessorial / A/R accounts. Owner designates them through the
  **existing** admin surface: `CoaRolesPage.tsx` → PUT `/api/v1/accounting/coa-roles` → upsert into
  `accounting.chart_of_accounts_roles` (deactivate prior, insert new, audit). The resolver reads that table
  first (§1.4).
- **Prerequisite (reachability):** confirm the CoA-roles admin surface is **mounted and reachable** in prod
  before relying on it (there is an in-flight branch `fix/mount-coa-roles-routes`). The future PR must not
  depend on an unmounted route. If a new `revenue_default`-style TONU role is added to `COA_ROLE_VALUES`
  (`resolver.service.ts`), the admin page must render it and the validate endpoint must include it.
- **Two designation mechanisms exist — reconcile explicitly:**
  1. `accounting.chart_of_accounts_roles` — the poster/GL role table (authoritative per §1.4).
  2. `accounting.expense_category_account_map` (`category_kind='revenue'`) — what the **invoice-line**
     revenue resolver actually reads today (and which is currently EMPTY, §1.5).
  The future PR must **seed both** consistently for the TONU/accessorial revenue codes, or route the invoice
  revenue resolver through `chart_of_accounts_roles`. **Owner ratifies which is canonical for revenue lines**
  (§7). Recommendation (to be confirmed): keep `chart_of_accounts_roles` authoritative and have the invoice
  revenue resolver fall through to it, seeding `expense_category_account_map` only as the category cache.
- No new role designation is hard-coded; all are owner-set rows (append-only, audited), entity-scoped.

---

## 5. Acceptance[] (future implementation PR — evidence before done)

Each item must resolve on **live evidence** (Rule 10 / evidence-before-done skill). CI-green ≠ done.

1. **CoA additive present (prod):** Neon query (RLS bypass) shows, per active entity, a non-postable
   `Sales of Service` parent + `Accessorial Revenue` parent with Detention/Layover/Lumper/**TONU**/Other
   children; all `account_type='Income'`; children `is_postable=true`; 0 rows deleted; legacy §1.3 accounts
   still exist (archived/relocated per owner mapping).
2. **Cancellation FK present + 0-NULL-safe:** `information_schema` shows `charge_invoice_id` /
   `charge_invoice_line_id` on `dispatch.load_cancellations`; existing rows unaffected (NULL allowed);
   FK targets `accounting.invoices` / `accounting.invoice_lines`.
3. **Flag OFF = no behavior change:** with `TONU_CANCELLATION_BILLING_ENABLED` OFF, cancelling a billable
   load produces **no** invoice (byte-for-byte today's behavior); guard + test prove it.
4. **Flag ON (per entity) bills correctly:** in a throwaway/test entity with flag ON, a billable cancellation
   raises exactly one invoice with a `tonu` line booked to **TONU Income**, A/R to the fail-closed
   `ar_control` account, debits=credits, audit rows emitted; forward+reverse drill resolve.
5. **Reuses existing poster:** diff shows the TONU path calls `buildInvoiceFromLoad` / the existing invoice
   A/R poster; **no new GL/journal math** is added (financial-agent confirms).
6. **Roles owner-designable + reachable:** CoA-roles admin surface is mounted; TONU/accessorial revenue
   designation is settable via the UI and persisted to `accounting.chart_of_accounts_roles` (audited);
   resolver returns the owner-designated account (fail-closed if undesignated).
7. **Linkage complete:** the §3.5 matrix resolves both directions on live data; no orphan cancellation charge,
   no unlinked invoice line.
8. **Guards wired (Rule 17):** the guards in §6 run in CI via verify-steps (no `package.json` /
   locked-guards / ci.yml edits) and each fails on a planted regression, passes on the fix.
9. **Deploy proof:** `/api/v1/healthz/shallow` `version` == merge SHA; the above verified **after** deploy.

---

## 6. Guard plan — Rule 17 compliant (NO hot-file thrash)

Per `.cursor/rules/17`: add `scripts/verify-<name>.mjs` + `scripts/verify-steps/<NNN>-verify-<name>.mjs`;
**do NOT** touch `package.json`, `.github/workflows/locked-guards.yml`, or `.github/workflows/ci.yml`.
`verify:pre-commit` auto-discovers steps. Next free step numbers are `1200+` (highest existing is `1199`).

Verify-step file shape (per Rule 18, `ctx.run` throws on failure):

```js
export default {
  name: "verify:tonu-cancellation-ar-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tonu-cancellation-ar-linkage.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-tonu-cancellation-ar-linkage.mjs"]);
  },
};
```

Proposed guards (each with an embedded `--selftest` of planted pass/fail fixtures):

| Step | Guard file | Asserts |
|---|---|---|
| `1200-verify-tonu-cancellation-ar-linkage.mjs` | `scripts/verify-tonu-cancellation-ar-linkage.mjs` | `cancellation.service.ts` billing call is behind `TONU_CANCELLATION_BILLING_ENABLED`, default OFF; reuses `buildInvoiceFromLoad`; no new `INSERT INTO accounting.journal*` in the cancellation path. |
| `1201-verify-tonu-coa-additive-only.mjs` | `scripts/verify-tonu-coa-additive-only.mjs` | The CoA migration is additive (CREATE/seed only into `catalogs.accounts`); no `DROP`/`DELETE` of legacy §1.3 accounts; parents non-postable. |
| `1202-verify-tonu-revenue-role-designated.mjs` | `scripts/verify-tonu-revenue-role-designated.mjs` | TONU/accessorial revenue resolves only from an explicit owner designation (`chart_of_accounts_roles` / seeded revenue map); fail-closed when undesignated (no silent shape-fallback pick). |
| `1203-verify-cancellation-invoice-linkage-both-ways.mjs` | `scripts/verify-cancellation-invoice-linkage-both-ways.mjs` | Forward+reverse FK linkage present (cancellation↔invoice↔line↔load↔customer); no orphan billable cancellation. |

(The existing `scripts/verify-hold-merge-gate.mjs` already blocks the future PR from merging without
`JORGE-APPROVED` — it is financial/migration/flag-flip.)

---

## 7. Explicit owner decisions required (system will NOT guess)

1. **Factoring reserve subtype classification (SEPARATE, blocks BS-move):** the 11 near-duplicate reserve
   accounts (§1.6) carry 5 different subtypes (CashOnHand / Savings / OtherCurrentAsset(s) / Retainage /
   UndepositedFunds). Which is canonical per factor (Faro / RTS / Love's / Ecapital), which are archived, and
   the standardized subtype (canonical is Asset per CPA `factor_reserve_held`) — **owner ruling needed before
   any balance-sheet reclassification.** Not implemented here.
2. **TONU revenue presentation — RESOLVED (owner ruling, 2026-07-21):** TONU is presented as
   **OPERATING REVENUE** — a **child account under the Accessorial Income parent** (alongside
   detention / layover / lumper), **NOT** Other Income. This matches the industry norm (McLeod / Alvys):
   TONU is operating accessorial revenue, booked in gross freight revenue, not below the line. Owner
   (Jorge P. Munoz) selected this in writing 2026-07-21 (see `IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` §19.2).
   The §2.1 target hierarchy already places **TONU Income** as an Accessorial Revenue child — that
   placement is now the **locked** presentation. No open question remains on this item.
3. **Legacy §1.3 accounts — archive vs keep-in-place:** relocate the messy layover/lumper/billable-income
   accounts as **archived children** under Accessorial Revenue, or keep them where they are with a documented
   crosswalk? (Never delete either way.)
4. **Canonical revenue-resolution mechanism (§4):** `chart_of_accounts_roles` (recommended authoritative) vs
   `expense_category_account_map` for invoice revenue lines — ratify one, seed accordingly.
5. **USMCA `4200` combined account:** when splitting Accessorial, does `4200 Accessorial / Detention Income`
   become the "Detention Income" child, or is it archived in favor of a fresh Detention child? (Kept either way.)
6. **Account numbering block** for the new parents/children (e.g. TRANSP/USMCA `42xx` accessorial sub-block) —
   owner confirms the scheme so it reads correctly in statements.

---

## 8. Non-goals / out of scope (this design and its future PR)

- No TMS→QBO write-back (parallel books; QBO reconcile-only — CPA lock).
- No reserve-account balance-sheet reclassification (decision #1 first).
- No deletion or rename of any existing account, tab, module, or surface (Rule 07).
- No change to opening balances / cutover dates (Rule 07 companion restraint).
- No new GL math (reuse existing poster — Rule 13).

---

## 9. Handoff / next steps

1. Owner reviews §7 decisions and this design; records rulings in
   `docs/lockdown/00_LOCKED_DECISIONS.md` (append-only) + `IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` if new spec.
2. Confirm `fix/mount-coa-roles-routes` is on main (CoA-roles admin reachable) — prerequisite for §4.
3. Financial/Accounting agent (CPA skill) reviews the revenue-recognition + presentation decisions.
4. Builder implements as a **single financial-cluster HOLD PR**: additive migration + cancellation FK +
   flag-gated billing reuse + guards (§6) + acceptance evidence (§5). Owner Neon-applies; GUARD re-proves.
5. This design PR stays **HOLD / do-not-merge** until owner directs.
