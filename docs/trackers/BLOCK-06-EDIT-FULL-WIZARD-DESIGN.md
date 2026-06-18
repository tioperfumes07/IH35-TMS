# Block 06 — Edit = full prefilled wizard (design, build-ready)

## HARD RULES (locked by Jorge 2026-06-18, enforced by `verify:dispatch-load-patch-money-evidence-guard`)
1. **STOPS — append-only, NEVER DELETE.** `mdata.load_stops` has inbound FKs that **CASCADE-delete legal
   evidence** (POD/BOL `0356`, detention `202606071901`/`0353`, stop arrivals `0222`). The PATCH UPDATEs
   kept stops in place (preserves the row id + all its evidence), appends new stops, and **archives
   removed stops via `status='cancelled'`**. A `DELETE FROM mdata.load_stops` is a §1 violation.
2. **MONEY GUARD — block the whole edit (409 + blocking doc id)** when the load has: an OPEN
   load-bookended `driver_finance.driver_settlements` (`trip_closed_at IS NULL`,
   `settlement_model='load_bookended'`, first/last_load_id), an ISSUED/non-draft `accounting.invoices`
   (`source_load_id`, status ∈ sent/partial/paid/factored), or a NON-OPEN `driver_finance.driver_bills`
   (`status <> 'open'`). Guards are read-only; the PATCH never writes `accounting.*`.
3. **NAMED CEILING + follow-on block (do NOT silently accept).** Charges are stored as a single
   `mdata.loads.rate_total_cents`, **not line items**. Consequence: the guard can only block the WHOLE
   edit, not just money fields — so a load with an open settlement/issued invoice cannot have even its
   non-financial fields (stop times, refs, notes) edited. **QuickBooks / NetSuite / McLeod guard at the
   CHARGE-LINE level and allow non-money edits.** This PATCH deliberately does NOT build a charges table
   (scope-smuggling). **FOLLOW-ON BLOCK (next after Block 06): "Charges as first-class line items with
   per-line history"** — a charge-line table + migration, unlocking line-level money guarding (block
   only money fields when posted) and per-line audit. Financial cluster → design-first, Jorge gates.

**Status:** Inc 2 backend PATCH built (gated PR) — `apps/backend/src/dispatch/update-load.service.ts`
+ `PATCH /api/v1/dispatch/loads/:id`. Inc 1 frontend (wizard edit-mode + read-only settlement callout +
"Open full editor" entry) builds on top once the PATCH is merged.

---

**Goal:** clicking Edit on a load opens the SAME booking wizard (`BookLoadModalV4`), fully prefilled,
so dispatch edits a load with the exact UI it booked it with — plus a **read-only settlement
callout** so they see settlement impact without being able to change posted money.

## Current state (verified 2026-06-18, Explore map)
- Live board = `DispatchBoard.tsx` (`boardColumns`); row click → `load_id` param → `LoadDetailDrawer`
  (a right panel). `DispatchList.tsx` is dead/unmounted.
- `BookLoadModalV4` is **CREATE-ONLY**: rich payload (customer, all detail fields, `stops[]`,
  `charges[]`, assignments, trip_type/tour_id), submits via `createDispatchLoad()` → `POST
  /api/v1/dispatch/loads`. Has `templatePrefillJson` + `applyLoadTemplateToBookForm()` (reusable for
  prefill) but no `loadId`/edit mode.
- Edit today = `LoadDetailDrawer` inline edit of **rate + notes only** → generic `updateLoad()` →
  `PATCH /api/v1/mdata/loads/:id` (schema allows only customer_id, status, rate_total_cents, currency,
  unit/driver/team assignments, notes, soft_deleted_at). **No stops/charges/detail update path.**
- Settlement read-only data already exists: `GET /api/v1/dispatch/loads/:loadId/settlement-summary`
  (display_id, status, is_open, driver, gross/deduction/reimb/net, period, nb_leg/sb_leg) — rendered
  today in `LoadDetailSettlementTab`.

## Gap → the only real blocker is a backend FULL-update endpoint
The wizard round-trips stops + charges; the existing PATCH cannot. So Edit needs:

### Backend (NEW) — `PATCH /api/v1/dispatch/loads/:id` (full update)  ⚠️ FINANCIAL-ADJACENT → Jorge reviews
- Mirrors `createDispatchLoadBodySchema` (same Zod body, all-optional-on-edit where safe).
- Detail/assignment/trip fields (customer, commodity, weight, instructions, notes, trailer_type,
  unit/driver/team, trip_type, tour_id, detention/late-risk, miles, border_routing): straightforward
  UPDATE on `mdata.loads` (reuse the lockstep column/values pattern; **void-not-delete** never applies
  here — these are scalar edits with audit via `audit.row_changes`).
- **stops**: replace strategy = soft-deactivate removed stops (`mdata.load_stops`, set inactive — NOT
  DELETE per §7 ARCHIVE-never-DELETE), upsert kept/added by sequence. Re-derive NB/SB delivery.
- **charges**: ⚠️ this is the financial edge. Editing charges after a load is on an OPEN
  pre-settlement or invoiced changes money. RULE: **block charge edits when the load is attached to a
  non-open settlement or an issued invoice**; when editable, route through the existing charge/
  allocation infra (write NO new GL math, reuse it). Default: charges read-only in edit mode v1;
  enable behind a flag once Jorge confirms the guard. This is the part that makes the PR financial —
  hold for explicit OK.
- Status-change still goes through the existing `/transition` endpoint (don't duplicate the state
  machine).

### Frontend (additive, self-merge once backend lands)
1. `BookLoadModalV4` Props: add `loadId?: string | null` + `editPrefillJson?` (or fetch inside).
   - When `loadId` set: title → **"Edit Load {display_id}"**; seed `defaultValues` from the load via
     `applyLoadTemplateToBookForm` (extend it to map a full load DTO, not just OCR/template keys);
     submit → new full PATCH instead of POST; success toast "Load updated".
   - Render a **read-only settlement callout** (reuse `settlement-summary`): when `is_open === false`
     show a locked banner "Settlement {display_id} closed — money fields read-only" and disable the
     charge section; when open, show net-pay impact inline. Never let the wizard mutate settlement.
2. Entry point: add **"Open full editor"** button in `LoadDetailDrawer` header (additive, next to the
   existing inline Edit) → opens `BookLoadModalV4` with `loadId`. Keep the inline rate/notes edit.
3. A new `getLoadForEdit(loadId)` in `api/dispatch.ts` (GET full load DTO shaped to the wizard form),
   or reuse the existing load-detail fetch if it already returns stops/charges.

### Guards / verification
- Static guard: edit-mode submit hits the full PATCH; charge section is disabled when settlement
  `is_open === false`; ADDITIVE — inline edit + create flow untouched (snapshot the create payload).
- `tsc` both apps; vitest on the wizard; mobile-responsive audit `new_vs_baseline=0`.

## Build order (so the non-financial slice ships first)
1. **Inc 1 (self-merge):** frontend edit-mode scaffolding that round-trips ONLY the
   already-PATCHable fields (customer/status/rate/assignments/notes) + read-only settlement callout +
   "Open full editor" entry. Stops/charges shown prefilled but **disabled with a "full edit coming"
   note** — honest, not silently dropped.
2. **Inc 2 (GATED — Jorge):** backend full PATCH (stops replace + charge-edit guard) → unlock the
   disabled sections. Financial-adjacent (charges) → show SQL/diff, wait for OK.

**Why gated:** the charge-edit path changes money on open settlements/invoices. Per §1.4 the whole
PATCH PR is financial-adjacent — never self-merge; design-first (this doc), then build on Jorge's OK.
