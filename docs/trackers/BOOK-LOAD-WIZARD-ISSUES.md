# Book Load Wizard — Open Issues & Construction Blocks

**Durable checklist + paste-ready construction blocks for the coder. Nothing here drops between sessions.**

Origin: frozen-session live crawl of the Book Load wizard (11 issues diagnosed, 0 built). Re-grounded
in **today's `main` code** by the coder on 2026-06-24 (post #1444/#1447/#1448). The blocker pair
(#1444 read / #1448 write `trailer_id`) is shipped + live (`c963a32` deployed). The issues below are
**independent of that pair** and still open.

> **HONEST CAVEAT (read first):** these root causes were verified against **source on `main`**, not a
> live browser crawl (this coder session has no browser). Where main may have advanced past the frozen
> session, the block is tagged **⚠️ RE-VERIFY LIVE**. The browser confirmation (actually booking a load,
> seeing the 404/totals) is Jorge's / GUARD's step before merge. Code-level root cause ≠ live-confirmed UI.

## Status legend
`OPEN` diagnosed, not built · `RE-VERIFY` may already be fixed on current main, confirm live first ·
`GATED` touches a flagged/locked area (hazmat drift / money) — coordinate before building ·
`SHIPPED` fixed + merged · `LIKELY-RESOLVED` code on current main already correct, live re-verify only.

| # | Issue | Priority | Status (verified 2026-06-24 vs main) | Root-cause confidence |
|---|-------|----------|--------------------------------------|------------------------|
| W-1 | `is_tarp_stop: ""` → booking 400 (hard blocker) | **P0** | **SHIPPED — PR #1449** (`edd33025`) | confirmed |
| W-2 | Empty "Create charge" code dropdown — additional-charges 404 | P1 | **LIKELY-RESOLVED** — route wired + **15 seeded rows** on main | live re-verify only |
| W-3 | 10× money bug ($1,500 → $15,000) | P0 | **LIKELY-RESOLVED** — live V4 uses correct cents `MoneyInput`; buggy path is **dead V3** | live re-verify only |
| W-4 | optimal-drivers 500 (`l.hazmat` 42703) | P1 | **OPEN — REAL bug; hazmat half GATED** | **HIGH (code-confirmed)** |
| W-5 | Totals not summing (charges/lumper → Total customer invoice) | P1 | OPEN — live confirm (money) | MED |
| W-6 | Lumper not in totals; "paid by broker" → auto reimbursable line | P1 | OPEN — money rule GATED | MED |
| W-7 | Section A ↔ Section C extra-stop fee coordination | P2 | OPEN — needs live | LOW |
| W-8 | State/address not binding; PC*Miler no autofill | P2 | **OPEN — REAL data-loss candidate; §C design-locked** | MED (code-confirmed) |
| W-9 | Calendar in stops not working | P2 | OPEN — needs live | LOW |
| W-10 | Out-of-proportion boxes (per-stop rates, create charge, stop 2) | P3 — CSS | OPEN — needs live | LOW |
| W-11 | Missing preview PDFs (office + driver-instructions) | P2 | OPEN — needs live | LOW |

> **VERIFICATION PASS — 2026-06-24, coder, vs current `main`** (no browser this session; verified against
> source + live `ih35_e2e` schema). Findings that change the build plan:
> - **W-1 SHIPPED** (PR #1449): backend `stopBooleanish`/`stopIntish`/`stopDatetimeish` zod coercion + FE
>   `setValueAs` on the hidden inputs + 10-case CI guard. Auto-merged on green; deploy verified.
> - **W-2 LIKELY-RESOLVED**: `catalogs.additional_charges` exists with **15 seeded rows**, route is wired
>   (`catalogs/dispatch/index.ts`). The 404 looks stale (frozen-session bundle). **Do not build — re-verify live.**
> - **W-3 LIKELY-RESOLVED**: the live `BookLoadModalV4` linehaul input is the correct cents-based
>   `MoneyInput` (×100). The `dollarsToCents` register path lives in **`BookLoadCustomerSection`, which is
>   dead** (only `BookLoadModalV3.deprecated.tsx` mounts it). **Do NOT "fix" dead code.** If a 10× persists
>   live, it is a different field → re-crawl.
> - **W-4 REAL + GATED**: `driver-optimizer.service.ts:186` `COALESCE(l.hazmat, false)` — `mdata.loads` has
>   **no `hazmat` column** in any migration (book-load stores hazmat in the `quicksave_pending_fields`
>   jsonb). `l.trailer_type` exists on prod but not `ih35_e2e` (drift). The hazmat source is **GATED**
>   (CLAUDE.md §4 "no hazmat fields" vs the unresolved hazmat-field drift) — **STOP for Jorge.**
> - **W-8 REAL but design-locked**: `book-load.service` writes `address_line1`/`state` to `mdata.load_stops`;
>   the stop UI binds them only via the **address autocomplete** (`setValue` at `BookLoadStopsSection.tsx:95,97`),
>   not a registered input, and the §C card is **design-locked to 11 fields**. Live re-verify whether the
>   autocomplete value actually persists into the submit payload; adding fields needs design sign-off.

---

## W-1 — `is_tarp_stop: ""` → booking 400 (HARD BLOCKER) — P0

**Root cause (code-confirmed).** The stops form sends `is_tarp_stop` as a **string** because it is bound
to a hidden `<input>` via react-hook-form:
- `apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx:175`
  `<input type="hidden" {...register(`stops.${index}.is_tarp_stop`)} />`
- RHF returns the raw input value (a **string**, default `""`), not a boolean.

The backend schema rejects a string for a boolean field:
- `apps/backend/src/dispatch/loads.routes.ts:175` and `:258` → `is_tarp_stop: z.boolean().optional()`
- payload `stops[i].is_tarp_stop = ""` → `z.boolean()` fails → **400**, booking blocked.

**Fix (do BOTH — root cause + defense in depth).**
1. **Frontend (root cause):** stop registering `is_tarp_stop` as a hidden text input. Either drop the
   hidden input and set the value programmatically, or coerce on register:
   `register(`stops.${index}.is_tarp_stop`, { setValueAs: (v) => v === true || v === "true" })`.
   Audit the OTHER hidden-input boolean fields in the same file the same way (same bug class).
2. **Backend (defense in depth — unblocks ALL clients immediately):** make the stop schema tolerant via
   a preprocess that maps the wire value to a real boolean — **do NOT use `z.coerce.boolean()`** (it maps
   the string `"false"` → `true`). Use:
   `is_tarp_stop: z.preprocess((v) => v === "" || v == null ? false : v === "true" ? true : v === "false" ? false : v, z.boolean()).optional()`
   Apply at BOTH `loads.routes.ts:175` and `:258` (book + update paths). Consider the sibling boolean
   stop fields (`lumper_required`, etc.) if they share the hidden-input pattern.

**CI guard.** Extend `tests/integration/dispatch-book-load-e2e.test.ts` (or a route unit test): POST a
booking whose `stops[0].is_tarp_stop = ""` → assert **200** (was 400). Add an FE test that the stops
section emits a boolean. Red→green.

**Verification.** Live: actually book a load with a stop — must not 400 on `is_tarp_stop`. Non-financial
(dispatch route/schema). Ship on green; Jorge merges.

---

## W-2 — Empty "Create charge" code dropdown / additional-charges 404 — P1 — ⚠️ RE-VERIFY LIVE

**What the frozen session saw.** `GET /api/v1/catalogs/dispatch/additional-charges` → 404; the charge-code
dropdown in `AccessorialEditor` is empty. Jorge: "should be the products/services catalog."

**Current-main reality (code).** The route **exists** on main:
- `apps/backend/src/catalogs/dispatch/additional-charges.routes.ts` (`catalogPath: "additional-charges"`,
  `tableName: "additional_charges"`), registered via `registerAdditionalChargesCatalogRoutes`.
- FE client `apps/frontend/src/api/catalogs-dispatch.ts:78`
  `additionalChargesCatalogClient = createDispatchCatalogClient("additional-charges")`.
- `AccessorialEditor.tsx:33` queryKey `["book-load-additional-charges", …]`.

**Therefore the 404 is likely STALE** (main advanced) **OR** the `catalogs.additional_charges` table is
**empty** (route 200s with `[]` → dropdown looks empty) **OR** Jorge wants the dropdown sourced from the
**QBO products/services** catalog (`mdata.qbo_items` / `catalogs.*`), which is a different decision.

**Coder steps.**
1. **RE-VERIFY first:** `curl` (authed) the live endpoint and/or book in the UI — is it 404, `[]`, or
   populated? Don't fix a 404 that no longer exists.
2. If **route 200 but empty:** confirm `catalogs.additional_charges` is seeded for TRANSP; if a seed
   catalog is intended, that is a `catalogs.*` change → **GATED, STOP for Jorge** (catalog data).
3. If **Jorge wants products/services source:** that is a product decision (which catalog backs the
   dropdown) → surface the fork, get Jorge's pick before wiring. Do NOT silently repoint the dropdown.

**Verification.** Live: the dropdown lists charge codes. Catalog-data changes are GATED.

---

## W-3 — 10× money bug ($1,500 → $15,000) — P0 (money correctness)

**Context.** A shared `apps/frontend/src/components/forms/MoneyInput.tsx` exists and PR #1384 fixed a
"350 → $3.50 100×" bug by routing §A money fields through it. Jorge now reports a **10×** error on
linehaul ($1,500 typed → $15,000 stored) — i.e. dollars multiplied by **1000** instead of **100**.

**Root cause (to pin — MED confidence).** A 10× (not 100×) error means a field that is **not** using the
fixed `MoneyInput`, or is double-converting. Candidate path: the charges/linehaul input feeding
`linehaul_cents` (`editLoadMapping.ts:201` `linehaul_cents: num(values.linehaul_cents)`) — if the input
collects **dollars** but the value is treated as **cents** elsewhere (or `× 1000`), you get 10×.

**Coder steps.**
1. Find the actual linehaul/charge input component in the wizard (AccessorialEditor / charges section) and
   confirm whether it uses `MoneyInput` or a raw number input.
2. Trace dollars→cents exactly once: a `MoneyInput` should store `Math.round(dollars * 100)`. Find the
   stray `* 1000` or a cents value re-multiplied.
3. Route the field through the shared `MoneyInput` (consistency with #1384) rather than a one-off fix.

**CI guard.** Unit test: entering `1500` (dollars) yields `150000` cents (not `1500000`). Add to
`MoneyInput.test.tsx` and/or the charges-calc test.

**Verification.** Live: type $1,500 linehaul → Total shows $1,500.00. **Money correctness — verify hard.**
Non-financial-cluster (FE display/transform, no `accounting.*`/posting), but **money math — double-check
with Jorge before merge** given the sensitivity.

---

## W-4 — optimal-drivers 500 (`l.hazmat` / `l.trailer_type` 42703) — P1 — partly GATED

**Root cause (code-confirmed — same defect class as `trailer_id`).**
`apps/backend/src/dispatch/driver-optimizer.service.ts:185-191` (endpoint
`GET /api/v1/dispatch/loads/:loadId/optimal-drivers`, `loads.routes`/`dispatch-refinements.routes.ts:145`):
```
SELECT l.id, COALESCE(l.hazmat, false) AS hazmat, l.trailer_type::text AS trailer_type, l.miles_deadhead
FROM mdata.loads l …
```
Verified against `db/migrations` + live `ih35_e2e`:
- `l.miles_deadhead` → **exists**.
- `l.trailer_type` → **absent on e2e** (count 0); **present on prod** per GUARD → **e2e drift**, not the prod 500.
- `l.hazmat` (bare) → **absent on e2e AND not added to `mdata.loads` by any migration**. Book Load stores
  hazmat inside the `quicksave_pending_fields` **jsonb**, not a column. The real hazmat columns (per the
  hazmat-field-drift note) are `hazmat_declared` / `hazmat_endorsement` — **NOT bare `hazmat`**. So
  `COALESCE(l.hazmat, false)` → **42703 → 500 on prod**.

**Fix.**
1. Replace `COALESCE(l.hazmat, false)` with the **real** source. This is **GATED by the hazmat-field
   drift** (CLAUDE.md §4 "NO hazmat fields anywhere" vs `mdata.loads.hazmat_declared` existing vs the
   jsonb blob). **STOP and confirm with Jorge which is canonical** before wiring — do NOT guess a hazmat
   column. Interim safe option: read hazmat from the jsonb (`(l.quicksave_pending_fields->>'hazmat')::bool`)
   if that is where book-load actually writes it — **verify that path** first.
2. `l.trailer_type` is fine on prod but **breaks the e2e integration DB** (drift). The CI guard must run on
   a DB that has `trailer_type`, or the query must tolerate its absence. Flag the e2e↔prod `trailer_type`
   drift to Jorge (separate from this fix).

**CI guard.** Integration test hitting `optimal-drivers` for a real load → asserts **200** (reproduces the
42703 red→green), mirroring `dispatch-load-detail-e2e.test.ts` / `dispatch-book-load-e2e.test.ts`.

**Verification.** Live: open a load → driver suggestions load (no 500). **Backend; the hazmat half is
GATED — STOP for Jorge.**

---

## W-5 — Totals not summing (charges + lumper → Total customer invoice) — P1

**Where.** `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx:943` renders the "Total
customer invoice" row; `editLoadMapping.ts` carries `linehaul_cents` / `fuel_surcharge_cents` /
`accessorial_cents` / `lumper_amount_cents`. Backend total = `bookLoadRateTotalCents(charges)` /
`mergeBookLoadCharges` (`book-load-accessorial.ts`, unit-tested).

**Diagnosis (to confirm live).** The displayed "Total customer invoice" does not re-sum the live charge +
lumper inputs as the user edits them. Coder: find the total computation in `BookLoadModalV4.tsx`, confirm
it sums **all** charge lines + lumper (W-6) reactively, and that it uses the same grammar as
`mergeBookLoadCharges` so FE preview == BE stored total. Add an FE test: linehaul + accessorial + lumper →
Total equals the sum.

**Verification.** Live: edit a charge → Total updates and matches. Couples with W-3 (correct cents) and
W-6 (lumper). FE; money preview — confirm against BE `bookLoadRateTotalCents`.

---

## W-6 — Lumper not in totals; "paid by broker" → auto reimbursable invoice line — P1

**Two parts.** (a) `lumper_amount_cents` is not added into the customer-invoice total (see W-5).
(b) When **lumper paid_by = broker**, business rule: auto-add a **reimbursable** charge line to the
customer invoice. `lumper_paid_by` exists on stops (`book-load.service.ts` stop INSERT cols include
`lumper_paid_by`, `lumper_amount_cents`). Allowed `lumper_paid_by` values: `carrier|shipper|broker|
receiver|unknown` (`BookLoadStop` type).

**Coder.** (a) include lumper in the W-5 total. (b) the reimbursable-line auto-add is an **invoice
construction rule** — whether it posts/affects the customer invoice total touches money semantics →
**confirm the rule with Jorge** (reimbursable vs informational) before building. Surface the fork.

**Verification.** Live: lumper amount appears in Total; broker-paid lumper creates the reimbursable line.
Money rule — **gate the invoice-line behavior with Jorge.**

---

## W-7 — Section A ↔ Section C extra-stop fee coordination — P2 — ⚠️ RE-VERIFY LIVE

Extra-stop fees entered in Section A and the per-stop rows in Section C are not kept in sync. Coder: locate
the Section A fee field and the Section C per-stop rate rows in `BookLoadModalV4.tsx` /
`BookLoadStopsSection.tsx`; define the single source of truth and bind both to it. **Re-verify live** which
direction is authoritative before wiring. P2; needs live confirmation.

---

## W-8 — State dropdown / address binding / PC*Miler autofill — P2 — ⚠️ RE-VERIFY LIVE

Three sub-issues in the stop address UI: (a) state dropdown is not type-to-filter; (b) selected address is
not binding into the booking payload; (c) PC*Miler is not autofilling miles. (b) is the serious one — a
non-binding address means stop data is lost. Coder: in `BookLoadStopsSection.tsx`, confirm the address /
state fields are registered into the form payload and that the PC*Miler miles call populates
`miles_practical`/`miles_shortest`. **Re-verify live**; (a)/(c) are UX, (b) may be a real data-loss bug.

---

## W-9 — Calendar in stops not working — P2 — ⚠️ RE-VERIFY LIVE

The date/calendar picker in the stops section is not functional (appointment date/time). Coder: locate the
date input in `BookLoadStopsSection.tsx` (appointment_start_at / appointment_end_at), confirm the picker
mounts and binds. **Re-verify live.** Ties to Q9-TZ timezone work if dates need TZ handling.

---

## W-10 — Out-of-proportion boxes (per-stop rates, create charge, stop 2) — P3 (CSS)

Layout/sizing only — per-stop rate boxes, the create-charge box, and stop-2 render out of proportion.
Pure CSS/Tailwind in `BookLoadStopsSection.tsx` / `AccessorialEditor.tsx`. Must honor §7 palette + density
tokens; ADDITIVE-only (no field/column removal). P3, non-financial, ship on green.

---

## W-11 — Missing preview PDFs (office + driver-instructions) — P2 — ⚠️ RE-VERIFY LIVE

The office preview PDF and the driver-instructions preview PDF do not render from the wizard. Coder: find
the preview/PDF generation path (driver_instructions_file_id / a preview endpoint); confirm the endpoint
exists and the wizard calls it. **Re-verify live** whether this is a missing route, an R2 fetch, or a UI
wiring gap.

---

## Build order (recommended)
1. **W-1** (P0 blocker — nothing else is testable in-UI until booking succeeds).
2. **W-4** backend 500 (P1; hazmat half STOPS for Jorge) + **W-3** money (P0, verify hard).
3. **W-5 / W-6** totals + lumper (money preview; W-6 invoice rule gates with Jorge).
4. **W-2** charge dropdown (RE-VERIFY first — may be resolved or a catalog-data gate).
5. **W-8(b)** address binding (data loss), then **W-9** calendar, **W-7** fee sync, **W-11** PDFs.
6. **W-10** CSS proportions (cleanup).

Each fix gets a CI guard so it can't regress (CLAUDE.md §2). Non-financial UI/route fixes ship on green;
hazmat (W-4), catalog data (W-2), and invoice-line money rules (W-6) **STOP for Jorge**.
