# DESIGN — Parts inventory → accounting (GL valuation / COGS) linkage (HOLD)

> **STATUS: DESIGN ONLY · BUILD-AND-HOLD · DO NOT MERGE.**
> Doc-only. **NO migration, NO money code, NO flag flip.** Planning artifact for a future
> financial-cluster PR (Rule 13; separate Builder / Financial-Accounting / GUARD agents).
> Doc-only exception: Rule 02 §Exception.
>
> - Block: `0441-mod13-inventory-accounting-none` (accounting drain)
> - Branch: `design/mod13-parts-inventory-accounting-hold` (fresh from `origin/main` @ `e2db37a74`)
> - Spec sources: Rule 01 blueprint set; Law of the Land linkage; CPA locks
>   (`.claude/skills/ih35-accounting-decisions`); Rule 07 never-delete.
> - **This design decides an accounting POLICY (periodic vs perpetual) — it is owner/CPA-gated. No method
>   is implemented until the owner rules §5.**

---

## 0. Problem statement (the trust defect)

`maintenance.parts_inventory` tracks **quantity and cost** (`on_hand_qty`, `unit_cost_cents`) but this data
**never touches the general ledger**. There is:
- no inventory **asset** account link (parts on the shelf are not represented on the balance sheet),
- no **COGS / expense** posting when a part is consumed on a work order, and
- no reconciliation between the stock ledger and any `accounting.*` balance.

WO-linked parts *billing* to a vendor does exist (`two-section-service.autoCreateBillFromWO` /
`autoCreateExpenseFromWO`), but that books the **vendor purchase**, not the **inventory valuation** of parts
held in stock or the **cost recognition** on consumption. Whether inventory *should* hit the GL as an asset
depends on a policy choice the system must not guess.

**Fix-not-patch** (Rule 16): the root is a missing accounting **policy + linkage**, not a report bug. The
correct fix picks the owner/CPA-approved costing method, wires it to owner-designated GL accounts (via the
PRIMARY role table `accounting.chart_of_accounts_roles`), reuses the existing poster (no new GL math,
Rule 13), and proves it on live data.

---

## 1. Verified facts (evidence, not memory) — `origin/main` @ `e2db37a74`

### 1.1 Stock ledger exists with cost, but no GL columns
- `maintenance.parts_inventory` has `on_hand_qty`, `unit_cost_cents` (`db/migrations/0272_maint_parts_pm.sql:11`,
  seeded `0277_mnt5_parts_catalog_seed.sql`), plus `sku`/`part_number`/`category`/`location`/`last_purchase_date`
  (`202607050850_inv1_parts_real_sku_category_notes.sql`, `parts-inventory.routes.ts:63-100`). It has **no**
  `inventory_asset_account_id`, no `cogs_account_id`, no valuation column, and no posting hook.
- The receive path `parts-inventory.routes.ts:63` `INSERT … on_hand_qty` (and `:100` `SET on_hand_qty = … + $3`)
  updates quantity only — it never posts an inventory receipt to the ledger.

### 1.2 WO-linked parts *billing* is built (but it is the purchase side, not valuation)
- `apps/backend/src/maintenance/two-section-service.ts:540` `autoCreateBillFromWO` and `:595`
  `autoCreateExpenseFromWO` create `accounting.bills` / `accounting.expenses` from a work order; the
  WO↔bill/expense FK is hardened in `db/migrations/202607050810_wo_bill_expense_hard_fk_link.sql`.
  `maintenance.parts_invoice_links` (`parts-invoice-links.routes.ts:153`) links parts to a **vendor invoice**.
- This means a part **bought and put straight on a WO** already books an expense (a **periodic /
  expense-on-purchase** treatment). What is missing is treatment of parts **held in stock** (bought now,
  consumed later) as an **asset** until consumed.

### 1.3 GL account designation is owner-driven and entity-scoped
- `accounting.chart_of_accounts_roles` (`db/migrations/0223_block_35_chart_of_accounts_roles.sql`) is the
  PRIMARY per-opco `role → account_id` table; the resolver reads it first
  (`accounting/coa-roles/resolver.service.ts`). Any inventory-asset / COGS account must be an **owner
  designation** here — never guessed, never a hardcoded uuid, entity-scoped (Rule 14).

---

## 2. The policy decision (owner/CPA — this is the crux)

Two acceptable GAAP treatments; the correct one depends on materiality and how IH35 wants its books to read.
Researched against QuickBooks (inventory item vs expense), NetSuite (perpetual inventory + COGS), and
trucking-maintenance practice (McLeod/Alvys shops commonly expense consumables on purchase):

### Option A — Periodic (expense-on-purchase) — *simplest, matches current billing path*
- Parts are expensed to a maintenance-parts expense/COGS account when purchased (already effectively what the
  WO bill/expense path does). `parts_inventory` remains a **operational quantity tracker only** (reorder,
  location), explicitly **not** a GL asset.
- Pros: no balance-sheet inventory to reconcile; least code; matches most owner-operator trucking shops.
- Cons: parts on the shelf are not an asset on the balance sheet (understates assets if stock is material).
- **If Option A is chosen, mod13 becomes largely a DOCUMENTATION + guard task**: assert `parts_inventory` is
  intentionally non-GL and the purchase expense is the sole recognition — closing the "no linkage" finding as
  *by-design*, not a defect.

### Option B — Perpetual (capitalize + COGS on consumption) — *McLeod/NetSuite-grade*
- Purchase: **DR Inventory (asset) / CR A/P or Bank** (parts capitalized at cost).
- Consumption on a WO: **DR Maintenance Parts COGS/Expense / CR Inventory (asset)** at the costing basis.
- Costing basis: **average cost** (recommended — `unit_cost_cents` already tracked) vs FIFO. Average cost is
  simplest to reconcile and is QuickBooks' method.
- Pros: correct balance sheet + matched cost recognition; auditable stock↔GL tie-out.
- Cons: requires an inventory sub-ledger reconciliation, consumption posting on WO close, and shrink/adjustment
  handling. More code + more owner controls.

**Recommendation (to be confirmed):** if parts stock is **immaterial**, Option A + doc/guard (cheapest, honest).
If stock is **material** (large on-hand value), Option B with **average cost**, reusing the existing poster.
The owner/CPA rules this in §5 before any migration.

---

## 3. Design — Option B shape (only if owner chooses perpetual)

### 3.1 Additive schema (future PR)
- `accounting.chart_of_accounts_roles` designations (owner-set): `inventory_asset`, `maintenance_parts_cogs`
  per entity. **No new account is auto-created** — owner designates existing/owner-created `catalogs.accounts`.
- Inventory sub-ledger of movements (append-only, void-not-delete): a
  `maintenance.parts_inventory_movements` table (or reuse an existing movement table if present) recording
  receipt/consumption/adjustment with `unit_cost_cents`, `qty`, `work_order_id`, `operating_company_id`,
  and the resulting `journal_entry_id` — so stock↔GL ties out both ways.
- Optional cached `avg_cost_cents` on `parts_inventory` (derived; recomputed on receipt).

### 3.2 Reuse the existing poster — write NO new GL math (Rule 13)
- Receipt and consumption post through the **existing** posting engine
  (`accounting/posting-engine.service.ts` / the maintenance poster `accounting/maintenance-posting/poster.service.ts`),
  which already books WO→bill/expense JEs. The inventory legs are new **mappings**, not new math.
- A/P / Bank / expense accounts resolve via the fail-closed role resolver; inventory-asset & COGS via the
  new owner-designated roles (§3.1).

### 3.3 Feature flag — OFF by default
- `PARTS_INVENTORY_PERPETUAL_ENABLED` (per-entity, default OFF). OFF = today's behavior (quantity-only +
  purchase expense). Flag flip = HOLD event.

## 3.4 Linkage matrix (forward + reverse — Law of the Land §9, Option B)

| From | To | Mechanism |
|---|---|---|
| `maintenance.parts_inventory` | `catalogs.accounts` (Inventory asset) | role `inventory_asset` (owner-designated) |
| parts consumption | `catalogs.accounts` (Parts COGS) | role `maintenance_parts_cogs` |
| `parts_inventory_movements` | `maintenance.work_orders` | `work_order_id` FK (consumption) |
| `parts_inventory_movements` | `accounting.journal_entries` | `journal_entry_id` FK (both legs) |
| purchase | `accounting.bills` / `mdata.vendors` | existing `autoCreateBillFromWO` / parts-invoice-links |
| all movements | `audit.audit_events` | append-only audit |

---

## 4. Acceptance[] (future PR — evidence before done)

**If Option A:** (1) doc + guard assert `parts_inventory` is intentionally non-GL and purchase-expense is the
sole recognition; (2) the "no accounting linkage" finding is reclassified *by-design* with owner sign-off.

**If Option B:**
1. **Default unchanged:** `PARTS_INVENTORY_PERPETUAL_ENABLED` OFF = today's behavior byte-for-byte.
2. **Receipt posts asset:** with flag ON in a test entity, receiving parts posts DR Inventory / CR A/P(Bank),
   debits=credits, audit + movement row with `journal_entry_id`.
3. **Consumption posts COGS:** consuming a part on WO close posts DR Parts COGS / CR Inventory at avg cost;
   `parts_inventory.on_hand_qty` decrements atomically in the same transaction.
4. **Stock↔GL tie-out:** sum of movement costs == inventory-asset account balance for the entity (live proof).
5. **Roles owner-designated + reachable:** `inventory_asset` / `maintenance_parts_cogs` resolve only from
   owner designations in `chart_of_accounts_roles`; fail-closed when undesignated.
6. **No new GL math:** diff reuses the existing poster (financial-agent confirms).
7. **Linkage:** §3.4 resolves both directions on live data; no orphan movement, no unlinked JE.
8. **Guards wired (Rule 17)**; **Deploy proof** `/api/v1/healthz/shallow` `version` == merge SHA.

---

## 5. Explicit owner decisions required (system will NOT guess)

1. **Costing policy: periodic (Option A) vs perpetual (Option B)** — the gating decision. Materiality of
   on-hand parts stock drives it.
2. **If perpetual: costing basis** — average cost (recommended) vs FIFO.
3. **GL account designations** — which `catalogs.accounts` are `inventory_asset` and `maintenance_parts_cogs`
   per entity (owner sets in `chart_of_accounts_roles`; new accounts owner-created, never auto-created).
4. **Shrink/adjustment handling** — how physical-count adjustments post (write-off account).
5. **Enablement scope** — which entities go perpetual first (if any).

## 6. Non-goals

- No auto-created GL accounts (owner-manual only). No TMS→QBO write-back (parallel books). No new GL math
  (reuse existing poster, Rule 13). No deletion/rename of `parts_inventory` or the WO billing path (Rule 07);
  perpetual is **additive** on top of the existing quantity tracker.

## 7. Guard plan — Rule 17 (no hot-file thrash)

Add `scripts/verify-<name>.mjs` + `scripts/verify-steps/<NNN>-verify-<name>.mjs` (next free ≥ `1210`; do not
touch `package.json` / locked-guards / ci.yml). Candidates: `verify-parts-inventory-perpetual-default-off.mjs`,
`verify-parts-inventory-posting-reuses-poster.mjs`, `verify-parts-inventory-roles-fail-closed.mjs`,
`verify-parts-inventory-stock-gl-tieout.mjs`. `scripts/verify-hold-merge-gate.mjs` blocks merge without
`JORGE-APPROVED`.

## 8. Handoff

Owner rules §5 (esp. #1 periodic vs perpetual) → Financial/Accounting agent (CPA skill) reviews the costing
policy + account mapping → Builder ships one HOLD PR for the chosen option; owner Neon-applies; GUARD
re-proves. HOLD / do-not-merge until owner directs.
