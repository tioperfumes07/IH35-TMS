# A2 — Inline "+ Add new" Mini-Form — Design Capture

**Parent design law:** `QBO_PARITY_UI_SYSTEM.md` PART A §A2.
**Status:** Design / Docs only — non-posting UI capture. Additive. Non-financial scaffolding may
self-merge when green+clean (per the push policy); the financial reference targets it feeds (accounts)
stay GATED.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Grounding:** built from the written design law (`QBO_PARITY_UI_SYSTEM.md` §A2/§A3) + the existing
TMS picker components — **not from memory of QBO**. Items needing a live QBO screenshot are marked
`[LIVE-CONFIRM]`.

---

## 0. What A2 is

Every reference dropdown in the accounting + catalog UI ends with a sticky **"+ Add new ___"** row
that opens an **inline mini-create** WITHOUT closing the parent panel; on save it returns with the new
value selected. Account dropdowns ALSO keep the existing TMS **lock-account** control (add the inline
"+ Add" alongside — do not replace it).

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

## 2. Mini-form chrome (our implementation spec)

### 2.1 Trigger row (inside every reference dropdown)
- The dropdown's option list renders normally; a **sticky bottom row** (pinned, always visible while
  scrolling options) reads **"+ Add new <entity>"** in the accent color, full-width, with a leading
  `+` icon. Clicking it does NOT close the parent panel/drawer.

### 2.2 Mini-form surface
- Opens as a **compact inline popover anchored to the dropdown** (not a full drawer), ~320–360px wide,
  single column, ~36–40px field height (matches A3 compact field sizing).
- Fields per §1 table for that entity. First field autofocused.
- **Footer:** `Cancel` (secondary) · `Save` (primary). No "Save and close" — this is a mini-create.
- On **Save**: POST the create; on success the popover closes, the parent dropdown **re-queries or
  optimistically inserts** the new record, and **auto-selects** it; focus returns to the dropdown.
- On **error**: inline error message above the footer (red, rounded), form stays open, no data lost.
- **Esc / click-outside the popover** cancels the mini-form only (parent panel stays open).

### 2.3 Account dropdown specifics (KEEP lock-account)
- For Income/Expense account dropdowns, the existing TMS **lock-account control** stays exactly where
  it is; the "+ Add new account" row is added **alongside** it. The mini-form for accounts mirrors the
  CoA New/Edit drawer fields (Account name* · Account type* · Detail type* · optional Account number ·
  Lock account toggle) but in the compact popover form factor.

### 2.4 Reuse (do NOT build a parallel picker)
- Build on the existing TMS picker components (the same ones recently fixed for the 50-cap issue — they
  load the full active set). The "+ Add new" row is an additive slot in those existing dropdowns, not a
  new dropdown system.

---

## 3. [LIVE-CONFIRM] items still owed from a QBO screenshot

These QBO-exact details cannot be captured from memory; capture live (Jorge's QBO session) and append:
- `[LIVE-CONFIRM]` exact label text per entity ("+ Add new" vs "+ Add new category" vs "Add new").
- `[LIVE-CONFIRM]` popover vs full-drawer per entity (QBO uses a small inline for some, a drawer for
  account) — confirm which entities open the ~576px drawer vs the compact popover.
- `[LIVE-CONFIRM]` exact field set QBO shows in each inline create (we listed our minimum; QBO may show
  more/fewer).
- `[LIVE-CONFIRM]` whether QBO returns to the parent with the value pre-selected (we assume yes).

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
- DO NOT fabricate QBO-exact chrome; the `[LIVE-CONFIRM]` items wait for a live screenshot.
