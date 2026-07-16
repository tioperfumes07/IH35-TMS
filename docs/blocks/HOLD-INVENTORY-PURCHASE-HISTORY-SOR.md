# HOLD — Inventory Purchase History missing SoR

**Status:** `[HOLD-FOR-JORGE]` — **docs only. Do not merge as a feature. No migration. No fake ledger.**  
**Date:** 2026-07-16  
**Source:** Audit residual after Assignments honesty (#2553 / `feat/inventory-assignments-honesty`)  
**Surface:** `/inventory/purchases` · label **Purchase History**  
**Money:** no — design for read/UI + additive append-only purchase events only; **no GL posting invented here.**

---

## Verdict (repo-verified)

**There is no purchase-history source of record.** Purchase History still renders the stock list.

| Claim | Evidence |
|-------|----------|
| Purchases page uses stock API | `apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx` → `listPartsInventory` + `PartsInventoryTable` |
| Assignments already honest | `InventoryAssignmentsPage.tsx` → `listPartsAssignments` / `GET …/parts-invoice-links` (WO consumption trail) — **leave unchanged** |
| Write path exists, read ledger does not | `POST /api/v1/maintenance/parts-inventory/purchases` only — **no GET purchases** |
| POST writes stock, not events | `parts-inventory.routes.ts` `INSERT INTO maintenance.parts_inventory (… last_purchase_*, on_hand_qty …)` |
| Schema has snapshot cols, not a ledger | `maintenance.parts_inventory.last_purchase_invoice_number / last_purchase_amount / last_purchase_date` (migration `0049_…`) |
| Closest related table is WO consume, not buy | `maintenance.parts_invoice_links` = WO ↔ vendor invoice **usage** (Assignments SoR) — **not** a vendor purchase ledger |

**Forbidden shortcuts (Rule 07 / Rule 16):**

- Do **not** relabel `listPartsInventory` rows as “purchase history.”
- Do **not** invent a ledger by projecting `last_purchase_*` from stock (overwrites / one-shot INSERT semantics; not append-only history).
- Do **not** reuse Assignments (`parts_invoice_links`) as Purchases — different identity (consume vs buy).
- Do **not** author migrations / GL / posting without owner gate.

---

## Root cause

Purchase History was shipped as a **tab chrome + stock twin**. Recording a purchase only mutates / inserts **on-hand stock** (`parts_inventory`) with **last-purchase snapshot fields**. No append-only purchase event table and no list API exist, so the UI cannot show a real vendor purchase ledger without inventing SoR.

---

## Proposed additive SoR (owner-gated — not in this PR)

### Table (sketch — owner must approve names / columns)

`maintenance.parts_purchases` (name TBD), append-only / void-not-delete:

| Column | Purpose |
|--------|---------|
| `id` | uuid PK |
| `operating_company_id` | RLS / entity scope (FORCED) |
| `parts_inventory_id` | optional FK → stock SKU affected |
| `vendor_id` | FK → `mdata.vendors` |
| `vendor_invoice_number` | invoice identity |
| `purchase_amount` | money amount (no GL post in v1) |
| `qty_received` | units received |
| `purchased_at` / `created_at` | when |
| `created_by_user_id` | actor |
| `voided_at` / `voided_by` | permanent record |
| linkage optional | `work_order_id` only if purchase is WO-tied; else null |

Also: wire `POST …/purchases` to **insert this event row** in the same txn as stock qty update (today’s INSERT-only stock row may need a follow-on upsert design — separate decision).

### API (additive)

| Method | Path | Role |
|--------|------|------|
| `GET` | `/api/v1/maintenance/parts-inventory/purchases?operating_company_id=` | List purchase events (opco-scoped, RLS) |
| `POST` | (existing) | Keep path; persist event + stock side-effect |
| (optional) | `GET …/purchases/:id` | Detail + EntityLinks |

Response row shape for UI: date, part description/SKU, qty, amount, invoice #, **vendor EntityLink**, optional **WO EntityLink**, stock id link.

### UI

- Rewire `InventoryPurchasesPage` to the new GET (ParityTable + EntityLinks).
- Keep `/inventory/purchases` door (never delete).
- Keep Assignments on `parts_invoice_links`.
- Update `scripts/verify-inventory-assignments-honesty.mjs` so Purchases is required to use the purchase list API (not stock table).

### Guards

- `verify-inventory-purchases-honesty.mjs` — page must not use `listPartsInventory` / `PartsInventoryTable`.
- Route + RLS scope smoke in backend test (membership + `app.operating_company_id`).

### Explicit non-goals (this HOLD)

- No TMS→QBO write-back.
- No new GL math / bill auto-post from purchases (bill create remains a separate operator path).
- No deletion of Inventory or Maintenance dual doors.

---

## Acceptance when unblocked (future implement PR)

```
ROOT CAUSE: Purchase History had no append-only purchase SoR; UI showed stock.
FIX: Additive purchase-event table + GET list + POST writes event; Purchases page wired; Assignments untouched.
GUARD: verify-inventory-purchases-honesty.mjs (+ honesty twin guard update).
LIVE PROOF: GET returns opco-scoped purchase rows; browser Purchase History ≠ Parts & Stock.
REMAINING: none for UI/read; GL/bill posting remains out of scope unless owner opens a money block.
```

---

## Gated for Jorge

1. Approve table name + column set (or alternate SoR if one already exists on Neon that repo missed — **prod verify first**).
2. Approve whether POST continues to INSERT a new stock row vs upsert by SKU.
3. Authorize implement PR (schema + GET + UI + guards). **This HOLD PR ships docs only.**
