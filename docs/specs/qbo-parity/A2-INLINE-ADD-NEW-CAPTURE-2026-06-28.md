# A2 — Inline "+ Add new" Mini-Form — Design Capture

**Parent design law:** `QBO_PARITY_UI_SYSTEM.md` PART A §A2.
**Status:** Design / Docs only — non-posting UI capture. Additive. Non-financial scaffolding may
self-merge when green+clean (per the push policy); the financial reference targets it feeds (accounts)
stay GATED.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Grounding:** built from the written design law (`QBO_PARITY_UI_SYSTEM.md` §A2/§A3) + the existing
TMS picker components, **then verified against the LIVE QBO UI** (IH 35 Transportation LLC, captured
2026-06-28 via a headed-Chrome harness; screenshots kept local-only — they contain real financial
data — never committed). The earlier `[LIVE-CONFIRM]` items are now resolved in §3.

---

## 0. What A2 is

Every reference dropdown in the accounting + catalog UI ends with a **"+ Add new ___"** row that opens
an inline create WITHOUT losing the parent context; on save it returns with the new value selected.
Account dropdowns ALSO keep the existing TMS **lock-account** control (add the inline "+ Add"
alongside — do not replace it).

> **LIVE CORRECTION (captured 2026-06-28):** in live QBO the "+ Add new" row sits at the **TOP** of the
> dropdown list (accent color, leading `+`), **not** the bottom. The create surface is a **right
> slide-over drawer** for rich entities (account, vendor, item) — not a tiny popover — with a
> **`Cancel · Save and new · Save and close`** footer. Build to match this; see §2.

> **Vocab tension to resolve with Jorge:** the absolute-rules line says our top-level vocab is
> "+ Create" / "+ Book", never "+ New / + Add". But §A2 specifies the *inline dropdown affordance* as
> "+ Add new ___" (QBO's wording). Recommendation: keep top-level buttons as "+ Create"; use
> "+ Add new <entity>" ONLY for the inline dropdown row (it reads naturally inside a select). Flagged
> for Jorge to confirm before build.

---

## 1. Dropdowns that get the inline "+ Add new" (from §A2)

Category · Class · Income account · Expense account · Payee · Vendor · Customer · Item
(Product/Service) · Terms · Payment method · Location.

Each entity's mini-form below lists ONLY the minimum fields to create a usable record (the full create
form remains available elsewhere). Required = `*`.

| Dropdown | Inline mini-form fields (minimum) | Create target | Gated? |
|---|---|---|---|
| Category | Name* · parent Category(optional) | `accounting`/catalog category | no |
| Class | Code/Name* | class catalog | no |
| Income account | Account name* · Account type* · Detail type* · (Lock account control kept) | `catalogs.accounts` | **GATED** (financial) |
| Expense account | Account name* · Account type* · Detail type* · (Lock account control kept) | `catalogs.accounts` | **GATED** (financial) |
| Payee | Name* · type (Vendor/Customer/Employee) | payee → vendor/customer | no (scaffold) |
| Vendor | Vendor display name* · Email(optional) · Phone(optional) | `mdata.vendors` | no |
| Customer | Customer display name* · Email(optional) · Phone(optional) | `mdata.customers` | no |
| Item (Product/Service) | Name* · Type(Service/Non-inventory)* · Income account(+Add)* | item catalog | no |
| Terms | Name* · Net days(int) | terms catalog | no |
| Payment method | Name* | payment-method catalog | no |
| Location | Name* (IH35: Location = driver — see B4 mapping) | location/driver map | no |

> Account mini-forms (Income/Expense) write to `catalogs.accounts` → **financial cluster, GATED**: a
> build PR touching `catalogs.accounts` must be branch + show-Jorge-diff + wait-for-OK. The mini-form
> CHROME (this doc) is non-posting design.

---

## 2. Create-surface chrome (LIVE-VERIFIED 2026-06-28)

### 2.1 Trigger row (inside every reference dropdown)
- A row reading **"+ Add new"** sits at the **TOP** of the dropdown's option list (accent/teal color,
  leading `+` icon), pinned above the options. Clicking it opens the create surface without losing the
  parent context, then returns with the new value selected. *(Live: confirmed on the account dropdown
  inside the "Add a new service" drawer — the `+ Add new` row was the first item above the account
  list.)*

### 2.2 Create surface = right slide-over drawer (rich entities)
- For account / vendor / customer / item, the create opens as a **right slide-over drawer (~30% width)**
  with collapsible sections — NOT a tiny popover. Single column, compact fields.
- **Footer (live):** `Cancel` · `Save and new` · `Save and close` (green) — for the account drawer the
  footer is `Cancel · Save (+ dropdown)`. (QBO varies the footer by entity; match per §3.)
- On **Save**: the record is created and the parent dropdown returns with it **selected**.
- Account create drawer includes a live **"New account preview"** tree showing where the account lands
  in the P&L / Balance Sheet.

### 2.3 Account dropdown specifics (KEEP lock-account)
- For Income/Expense account dropdowns, the existing TMS **lock-account control** stays where it is; the
  "+ Add new" row is added **alongside** it. The account create drawer mirrors the CoA New account
  drawer (§3.1).

### 2.4 Reuse (do NOT build a parallel picker)
- Build on the existing TMS picker components (the same ones recently fixed for the 50-cap issue — they
  load the full active set). The "+ Add new" row is an additive slot in those existing dropdowns, not a
  new dropdown system.

---

## 3. LIVE-VERIFIED create surfaces (captured 2026-06-28)

### 3.1 Account (CoA "New account" drawer — also the "+ Add new" account target) — GATED
Right drawer fields: **Account name\*** · **Account number** · **Account type\*** (dropdown) ·
**Detail type\*** (dropdown, depends on type) · **Make this a subaccount** (checkbox → parent picker) ·
**Description** · **Use for billable expenses** (checkbox) · **Lock account** (kept) · live **New
account preview** tree · footer **Cancel · Save (+dropdown)**.

**Account type options (live, grouped):**
- **Asset:** Bank · Accounts receivable (A/R) · Other Current Assets · Fixed Assets · Other Assets
- **Liability:** Credit Card · Accounts payable (A/P) · Other Current Liabilities · Long Term Liabilities
- **Equity / Income / Cost of Goods Sold / Expenses / Other Income / Other Expense** (below the fold)
- Detail type list is dependent on the chosen account type (e.g. type Expenses → detail
  "Advertising/Promotional", etc.).

### 3.2 Vendor ("New vendor" form) — slide-over
Sections: **Name and contact** (Company name · **Vendor display name\*** · Title · First · Middle · Last ·
Suffix · Email · Phone · Cc · Bcc · Mobile · Fax · Other · Website · Name to print on checks) ·
**Address** (collapsible). Footer **Save**. (Banner: "Skip the form — Ask for business and payment info".)

### 3.3 Customer ("New customer" form) — slide-over
Mirrors Vendor with AR fields (Customer display name\*, contact, billing/shipping address). *(Captured
shot 16; same form factor as Vendor.)*

### 3.4 Product/Service ("New product/service") — type picker first
Menu: **Service · Inventory item · Non-inventory item · Bundle · Batch import · Import from sales
channel**, then a create slide-over (Name\* · Item type · SKU · Category(+Add) · Class(+Add) · Sales
section with Income account(+Add) · Purchasing section). *(This is the "Add a new service" drawer where
the `+ Add new` account row was captured at the TOP of the account dropdown — §2.1.)*

> **All confirmed:** "+ Add new" label + TOP placement (§2.1); slide-over drawer (not popover) for rich
> entities; footer variants (§2.2); account create returns to parent with selection. No open
> `[LIVE-CONFIRM]` items remain for A2.

---

## 4. Acceptance for the eventual build (not built here)

- Every listed dropdown ends with the sticky "+ Add new <entity>" row.
- Saving creates the record and returns with it selected, parent panel never closing.
- Account dropdowns keep the lock-account control; account creates are GATED (catalogs.accounts).
- Uses the shared picker components (no parallel dropdown system). Static CI guard asserts the shared
  "+ Add new" slot is present on the reference dropdowns.

## 5. DO NOT
- DO NOT replace the lock-account control (additive only).
- DO NOT post or touch GL — account creation is metadata, still GATED for `catalogs.accounts`.
- DO NOT commit the source screenshots (real financial data — kept local-only, gitignored).
