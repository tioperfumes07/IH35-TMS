# Multi-Entity Separation — Durable Rule

**Status:** LAW (durable). Cross-references `PATH-B-STAGED-EXECUTION-PLAN.md` (how we get there) and
`COA-ENTITY-SEPARATION-AND-6999-DESIGN-C.md` (the audit that found the gap).
**Last verified against prod:** 2026-06-15.

---

## The rule (authoritative, from Jorge — written verbatim in intent)

**TRK, TRANSP, and USMCA are completely independent legal entities** — different federal tax IDs,
different owners, separate books. **They share NOTHING.** They do **not** merge reports, financials, or
charts of accounts. **They are vendors and customers to each other** — any value flow between them is an
arm's-length inter-entity transaction, never a shared internal balance.

| code | id | legal_name |
|---|---|---|
| TRANSP | `91e0bf0a-133f-4ce8-a734-2586cfa66d96` | IH 35 Transportation LLC |
| TRK | `b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e` | IH 35 Trucking LLC |
| USMCA | `5c854333-6ea5-4faa-af31-67cb272fef80` | USMCA Freight Solutions Inc (launches July 2026) |

## What this means in the schema

1. **Every financial object is scoped to exactly ONE `operating_company_id`** — accounts, postings,
   invoices, bills, payments, role mappings, expense-category maps, escrow, loans, fixed assets,
   settlement lines. No financial row is entity-less or entity-shared.
2. **`catalogs.accounts` is entity-partitioned.** After Path B it carries `operating_company_id NOT NULL`.
   An account belongs to one entity. (Before Path B it was a global pool — the historical defect; see
   the audit doc.)
3. **No commingling.** A single account may never be referenced by more than one entity's mappings or
   postings. Enforced by constraint + runtime guard, not by convention.
4. **System accounts exist once per entity**, resolved by `(operating_company_id, system_purpose)` and
   located **by QBO link** — never by account name/number. System purposes include
   `uncategorized_expense`, `ar_control`, `ap_control`, `undeposited_funds`.
   Uniqueness: `UNIQUE (operating_company_id, system_purpose) WHERE system_purpose IS NOT NULL AND
   deactivated_at IS NULL`.
5. **Reports & financials are always per-entity.** Never aggregate balances across entities. The only
   cross-entity linkage is explicit AR/AP where one entity is the other's customer/vendor.
6. **Entity ownership of a financial account is owner-confirmed**, never agent-inferred. QBO-imported
   accounts belong to the single QuickBooks company they came from (Jorge confirms which).
7. **USMCA must have its own complete chart** (incl. all system accounts) seeded before its July-2026
   launch. A missing `(entity, system_purpose)` mapping must **fail loud**, never silently fall back to
   another entity's or a global account.

## Guards that keep it true
- Per-entity partial-unique index on `catalogs.accounts (operating_company_id, system_purpose)`.
- Runtime resolver throws on: >1 active account per `(entity, purpose)`; active duplicate (#6999);
  bound account's QBO link drifted; missing required mapping.
- CI: commingling check (no `account_id` bound to >1 entity); per-entity trial-balance check
  (`SUM(amount_cents)=0` per entity); no cross-entity posting (posting's account entity = posting entity).

## Open gaps (tracked)
- `COMMINGLED-CONTROL-ACCOUNTS-TRANSP-TRK` (P1) — TRANSP & TRK share AR/AP/undeposited control accounts;
  resolved by Path B Stage 3.
- `USMCA-MISSING-UNCATEGORIZED-MAPPING` — USMCA has no `uncategorized_expense` mapping; resolved by
  Path B Stage 5. Blocks July launch.
