---
name: ih35-entity-facts
description: >-
  The hard reference card for IH35's three legal entities — their roles, what each owns/operates, which entity
  signs/books what, the RLS/entity-scoping reality, and the USMCA launch constraint. Load this before ANY
  cross-entity work (accounting, leases/contracts, unit ownership, QBO mapping, USMCA) so the highest-cost
  error class — putting something under the wrong entity — can't happen. Prevents e.g. a lease going out under
  the operating carrier instead of the asset holder. Secrets-split: prod identifiers (QBO realm IDs,
  operating_company_ids, connection details) are NOT here — they live in the local (git-excluded) CLAUDE.md.
---

# IH35 — Entity facts (who is who; who signs/books what)

Cross-entity mistakes are the **highest-cost error class** in this system (a contract under the wrong entity is
a real legal error; commingled books are a real financial error). This card makes the entity model
unambiguous. **Prod IDs are deliberately omitted** — resolve `operating_company_id` / QBO realm IDs from the
local CLAUDE.md/secrets, never hard-code them in tracked code.

## The three entities
| Entity | Role | Owns / does | Status |
|---|---|---|---|
| **TRANSP** | **Operating carrier** (active) | Runs freight; customer-facing; the books that mirror QBO; signs customer/broker docs; leases units FROM TRK | Live. QBO realm = "IH 35 Transportation LLC". |
| **TRK** | **Asset holder** | **Owns** the units/equipment; **depreciates** them (5-yr straight-line); earns rental income by leasing units to the operating carrier; **signs equipment leases** | Live (holding co). |
| **USMCA** | **Future carrier** | A second operating carrier | **Launches July 2026** — hidden until then; starts with **0 balances, TMS-only, isolated**. |

## Who signs / books what (get this right)
- **Customer / broker contracts, rate cons, invoices → TRANSP** (the operating carrier that runs the freight).
- **Equipment leases → TRK signs** (it owns the trucks). A lease is **generated in TRANSP's UI but BOOKS in TRK**
  (TRK owns + depreciates + earns rental income; Legal module = storage/consent only, not the finance engine).
- **Unit ownership** lives on the unit row via `owner_company_id` (TRK owns) + `currently_leased_to_company_id`
  (TRANSP/USMCA leases) — **NOT `operating_company_id`** (that column does not exist on `mdata.units`).
- **Depreciation, rental income, asset disposals → TRK.** **Line-haul revenue, driver settlements,
  customer A/R, vendor A/P → TRANSP.**

## Entity-scoping reality (the landmine)
- `accounting.*` / `catalogs.*` are **entity-partitioned** and RLS-scoped by `operating_company_id` — set it
  before reads or counts lie.
- **`mdata.*` / `catalogs.*` RLS is ROLE-scoped, not entity-scoped today.** Cross-entity data blends are masked
  now and **break at USMCA launch (July 2026)** — entity-scope remediation must land before USMCA. Never
  assume a `mdata`/`catalogs` read is entity-isolated; verify.
- **USMCA is isolated at launch** — 0 balances, TMS-only, no QBO. Don't wire it to shared registries or
  TRANSP's data.

## Rules of engagement
- Before booking/posting/signing anything, ask: **which entity?** Default wrong = expensive.
- Resolve entity IDs from local secrets — never commit a `operating_company_id` / realm ID into tracked code
  or a skill. Reference them by role (TRANSP/TRK/USMCA), not by UUID.
- Additive-only; USMCA slots into existing entity-scoped tables unchanged when it launches.

---
Cross-refs: [[cross-entity-leak-audit-usmca]], [[multi-entity-coa-path-b]], [[legal-finance-ownership-option-b]],
[[finance-engine-decisions-locked]], [[ih35-cpa-accounting-decisions]]. The one rule: **know which entity, every time.**
