# CODER INSTRUCTIONS — USMCA SETTLEMENT ABSORPTION + AlwaysTrack INGEST + DISPUTE WINDOW
**Author:** Cursor (lead) · **Date:** 2026-09-13 · **Scope:** USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`)
**Neon:** `tiny-field-89581227` branch `br-fancy-credit-akjnd07a`, reads with `SET LOCAL app.bypass_rls='lucia'`.
**This is an INSTRUCTION doc for the seats. Cursor lead authored it; the SEATS build it.** It restates
owner rulings + settled law — it invents nothing. On any conflict, `docs/MEMORY_BANK.md` + the source
signed documents win, and the MORE PROTECTIVE reading wins.

> **OWNER RULINGS being encoded (verbatim, 2026-09-13):**
> 1. *"all those settlements that carried a transportation load and a usmca — all expenses, driver pay,
>    fuel, etc are absorbed by usmca."*
> 2. *"you should know why those settlements were not created … there is a reconciliation by you, with
>    quickbooks, faro for transportation and faro for usmca. remember on aug 7 we began operating as
>    usmca, we still use same quickbooks, and same allystrack account."*
> 3. *"we need a dispute window, for driver settlements, invoices, for any type of dispute."*
> 4. *"write the logic and instructions for coders … not you [build it] just write the instructions,
>    logic, rules, etc. and the dispute window instructions what will be there."*

Sources of truth this doc rests on (already in the repo / owner's machine — do NOT re-parse or
re-derive): Cursor `docs/reconcile/USMCA-RECONCILIATION-2026-09-06-CURSOR.md`,
`~/Downloads/2026-09-07-Cursor-USMCA-AlwaysTrack-Reconciliation-State.md`,
`docs/MEMORY_BANK.md` (SCOPE / DOMAIN MODEL / NAMING LAW), the signed
`~/Downloads/Driver_Settlement_57xx.pdf` + `Company_Settlement_57xx.pdf`, the tie-out
`IH35-SETTLEMENT-TIEOUT-2026-09-04.xlsx`, and the measured gap in
`claude/09-13-2026-ALWAYSTRACK-PARITY-MEASURED-GAP.md` (as corrected by PR #22012).

---

## PART A — SETTLEMENT ABSORPTION LAW (owner ruling 2026-09-13) — LAW, guard-enforced

**The tour/settlement is the ATOMIC unit for the entity cutover, NOT the individual load.**

USMCA began operating **2026-08-07** on the **same QuickBooks realm (`91e0bf0a`) and the same
AlwaysTrack account** as IH35 Transportation. One AlwaysTrack document series (5753, 5760–5803) therefore
spans BOTH entities. Classify each AlwaysTrack **tour/settlement** (never a single load, never a
calendar week — a settlement is a TOUR: NB + optional TR + SB legs; see MEMORY_BANK DOMAIN MODEL):

1. **A settlement is USMCA iff it carries at least one USMCA-era leg.** Operational predicate, tested by
   Claude at **0 exceptions across all 44 documents**: **the settlement's END date ≥ 2026-08-07 ⇒ USMCA.**
   Equivalent statement of the owner ruling: **any tour that carries a Transportation load AND a USMCA
   load is absorbed WHOLLY into USMCA.**
2. **ABSORPTION:** for such a mixed/straddling tour, **ALL of its economics are USMCA's** — every leg's
   invoice / line-haul revenue, driver pay, fuel, DEF, tolls, DTOPS crossings, scales, lumper, tires,
   road service, every deduction. **Nothing is split back to Transportation.** The pre-cutover leg's
   costs ride into USMCA with the tour.
3. **A settlement is Transportation (frozen, out of USMCA) iff ALL its legs are pre-cutover** (tour END
   ≤ 2026-08-06). Those are `5753, 5760–5768` — already QuickBooks-reconciled under Transportation, and
   **correctly NOT on the USMCA books**. Do not create them in USMCA. (Their totals — 69,698.00
   invoiced / 13,873.82 driver pay / 29,072.80 fuel / 1,881.91 expenses — belong to frozen Transportation.)
4. **Identity:** every USMCA settlement's number is the **4-digit AlwaysTrack `source_document_ref`**
   (e.g. 5772, 5779). NEVER the internal `display_id` counter (`S-13xxx` / `S-YYYY-NNNN`) — that is a
   mislabeled load#-with-`S-` prefix and is retired from the shown/business path (Rule 03; Master
   Register PART 7). Driver-side and company-side settlements for one tour **share the same
   `source_document_ref`.**

**Pre-cutover loads that are correctly absent from USMCA** (do NOT seed): 13481, 13489 (doc 5760), 13501
(doc 5766), and the 13471–13507 Transportation band except any load that shares a tour with a USMCA leg
(then Rule A.2 absorbs it).

**GUARD (author it, wire into money gate):** `scripts/verify-usmca-settlement-cutover.mjs` —
FAILS if any `driver_finance.driver_settlements` row scoped USMCA has an end/close date < 2026-08-07 with
NO USMCA-era leg (i.e. a pure-Transportation tour leaked into USMCA), OR if a tour with a USMCA-era leg
is missing any of its legs' economics from USMCA. Assert the tested predicate (END ≥ 08-07) at 0
exceptions.

---

## PART B — ALWAYSTRACK / SIGNED-DOC INGEST LOGIC & RULES (for the seats)

**Target to close (measured, PR #22012, 69 real USMCA loads):** line-haul short **−$23,587.59**, driver
pay short **−$5,852.30**, fuel short **−$34,428.17**, **136 expense lines** short, **9 shell loads** carry
nothing, **7 loads on the wrong side of the cutover flag** (incl. **13579 = `is_sample_data=true` with
status `invoiced` — fix the flag**). Every dollar/line below comes from the signed documents + tie-out —
**no fabricated data, ever.**

**B0 — Global rules (apply to EVERY item in Part B):**
- **Additive only.** Rule 07 NEVER DELETE / 00-IH35-LAW void-not-delete. Never `DELETE` a financial row;
  a correction is a void/reversal + re-post. **No revert of any existing feature/data without the owner's
  explicit say-so.**
- **Reuse the existing gated posters — never hand-write new GL math** (skill `ih35-financial-migrations`
  / `ih35-accounting-decisions`). Migrations idempotent, CREATE-only, `IF NOT EXISTS`, RLS + grants.
- **Source-backed only:** every amount traces to a signed Driver/Company settlement PDF, the tie-out
  xlsx, or the Faro ledger. Owner enters opening balances; no seat writes test/sample fixtures into prod.
- **USMCA scope** on every read/write; `is_sample_data IS NOT TRUE` on anything that counts.
- Build + prove on the Neon branch **penny-exact to the signed doc**; merge on green (FAST WEEKEND MERGE).
  The **prod money re-post is the one owner-gated step** — build it, prove it on branch, then the owner
  presses go (MEMORY_BANK: no prod post without the owner's explicit yes).

**B1 — FUEL as a real per-load cost (owner: fuel is absorbed by USMCA; McLeod/Alvys standard).**
- Write **one `fuel.fuel_transactions` row per fuel receipt** on the Company settlement's FUEL PURCHASES
  table, linked to its load, and **post the expense FROM that row** (one posting per receipt). Today
  `fuel.fuel_transactions` = 0 rows and fuel sits as an uncategorized `accounting.expenses` "Diesel —"
  memo, so IFTA, MPG, the fuel planner and fuel-card overage all read empty. This makes them real.
- Include DEF as its own line. De-duplicate: some app settlements already carry duplicate fuel rows
  (e.g. more app rows than the document shows) — reconcile to the **document's** receipt count, void the
  extras (never delete).

**B2 — Per-load EXPENSE lines (136 short).** Ingest every non-fuel cost line from the Company settlement —
DTOPS crossings, scales, lumper, tolls, tires, road service — as **categorized** `accounting.expenses`
lines with a line-level `load_id` and the correct `line_category` (not `'(none)'`), each linked to its
load and tour.

**B3 — DRIVER PAY + MILES per load.** `driver_finance.driver_bills.gross_amount_cents` = the load's fixed
fee (from `accounting.bills.amount_cents`), one bill per load. Ingest AlwaysTrack **loaded miles**
(`mdata.loads.loaded_miles`) and **driver-pay short miles** (`miles_shortest`) from the signed doc /
tie-out for every load that lacks them.

**B4 — NET PAY = the signed PDF TOTAL DUE (document wins).** Compute net through the **canonical
deduction engine** (`driver_finance.driver_settlement_deductions`), **pay-first then escrow**, applying:
admin fee (−$10/settlement), escrow (−$25/load), and cash-advance recovery — so each settlement's net
equals its signed **TOTAL DUE**. Net-pay floor = 5% editable. **Fix 5801/5802/5803 (net = $0.00 on
non-zero gross) → their real TOTAL DUE.** Never overwrite gross (gross already ties on all 12 recent docs).

**B5 — 1:1 SETTLEMENT RE-CUT to AlwaysTrack tours (regroup the mega-rows).** The seed made **one mega-row
per driver** and merged 2–4 tours onto it, tagging only ONE `source_document_ref` (9 of 17 are misgrouped).
Re-cut so **each signed AlwaysTrack doc = one app settlement**, same loads, same net, driver+company sides
sharing `source_document_ref`, started/closed dates from the tour. Mechanism = existing
`confirmPresettlementLink` (`create_new` / `link_existing`) — **no new write path**
(`docs/audit/TOUR-SPLIT-PLAN-2026-09-06.md`). This is a **safe regroup** (`driver_settlement_gl_runs = 0`,
`settlement_payment_events = 0` for USMCA → 0 GL, 0 payments behind any "closed" row) — void/redo, not a
GL reversal.
- **Re-post via the canonical Bill + BillPayment engine** (`driver_settlement_gl_runs` /
  `driver_settlement_gl_bills`), **NOT** the single-JE `closeSettlementPayRun` path the 17 were wrongly
  posted through (MEMORY_BANK DOMAIN MODEL). Driver = a VENDOR (A/P).
- **Pedro Abraham Lopez Collado / tour 5772** must rebuild in FULL ($997.08, all 4 loads incl.
  13502/13507) — he is genuinely underpaid; do not reverse him to $0.

**B6 — LINK every driver bill to its settlement.** `driver_finance.driver_bills.settled_in_settlement_id`
is NULL on all live bills → set it so the load→settlement chain (and the AlwaysTrack number beside every
load, Master Register PART 7) rides through the bill path.

**B7 — APPLY ABSORPTION (Part A) during ingest.** For every mixed/straddling tour (END ≥ 08-07 with a
pre-cutover leg), ingest **all** legs' economics into USMCA per B1–B6. Fix the **7 loads on the wrong side
of the cutover flag**, and clear **13579** `is_sample_data=true`/`invoiced` to its correct real state.

**B8 — EVERY FARO PURCHASE MAPS TO A LOAD (owner ruling 2026-09-13: *"any payments or purchases by Faro
that you have not found a load — then it IS that load, same dates etc."*).** A Faro purchase is proof the
load ran; never report a Faro purchase as "load never entered." Match by AllwaysTrack WO/PO → amount →
debtor → date (Load existence/customer/WO = AllwaysTrack `Report 52`; invoice + factoring AMOUNT = Faro
purchase — proven principle, `docs/reconcile/ALLWAYSTRACK-FARO-LOAD-RECONCILE-2026-09-12.md`). The three
Faro purchases previously flagged "no advance" are all real loads:
- **inv 062 · Tennessee Steel $1,000 · 09/10 → load 13584** — IN the app (corrected Armstrong $0 →
  Tennessee Steel $1,000, proforma invoice). Action: create its Faro advance + send the invoice. NOT missing.
- **inv 061 · Direct Connect Logistix $2,100 · 09/10 → load 13585** — the load ran (AllwaysTrack WO
  6492969) but was never keyed into our DB. Action: **create load 13585 from AllwaysTrack** at $2,100,
  then its invoice + Faro advance. On the 09-12 "MISSING loads to create" list.
- **inv 013 · Sethmar Transportation $4,900 · 08/14** — an **08/14** load, **before the 08/28 start of the
  AllwaysTrack Report 52 window** already reconciled, so it was never in that pass. Action: ingest the
  **08/07–08/27 AllwaysTrack load window** and create this load at the Faro date/amount, then invoice +
  advance. Not fabrication — Faro + AllwaysTrack are the source.

**Root cause of the gap (verified, not guessed):** the loads physically ran and were factored with Faro
(Faro holds the invoices), but the TMS was **behind on load entry in early USMCA (Aug) and a couple of Sept
days**, and the pre-08/28 AllwaysTrack window was never ingested. AllwaysTrack (dispatch source of truth)
has them. Owner: AllwaysTrack numbers are the source of truth for dispatch — ingest from it, don't invent.
Owner (money) workflow entry: raising/creating a sent+factored invoice stays owner-gated; the load
create + advance link is Cursor (load-linkage) + the CC-1 AllwaysTrack importer.

---

## PART C — DISPUTE WINDOW SPEC (owner: "for driver settlements, invoices, for any type of dispute")

**One unified "Disputes" window.** It UNIFIES what already exists — do NOT duplicate or rewrite the money
logic, and (Rule 07) do NOT remove the existing pages; add the hub alongside and link them.

**What already exists (reuse):**
- **Settlement disputes (GL-posting path):** backend `apps/backend/src/accounting/disputes.routes.ts`
  (`/api/v1/disputes` office queue), `driver-finance/settlement-dispute.*`, `settlement-disputes-p6.*`;
  frontend `pages/accounting/DisputeQueuePage.tsx` (submit → start-review → decide with a corrective JE),
  `pages/drivers/SettlementDisputeList.tsx` / `SettlementDisputeModal.tsx`, `pages/driver/DisputesPage.tsx`.
- **Invoice disputes (tracking-only, NO GL — already built by Cursor, NO UI yet):** table
  `accounting.invoice_disputes`; backend `apps/backend/src/accounting/invoice-disputes.{routes,service}.ts`:
  `POST/GET /api/v1/accounting/invoices/:id/disputes`, `GET /api/v1/accounting/invoice-disputes`,
  `POST /api/v1/accounting/invoice-disputes/:id/resolve`, `POST …/:id/cancel`. Reason/resolution enums
  exported (`INVOICE_DISPUTE_REASONS`, `INVOICE_DISPUTE_RESOLUTIONS`). **The two open invoice disputes
  13581 & 13586 currently have nowhere to be viewed — this window must surface them.**

**What the window contains (build this):**
1. **Route + nav:** new hub at `/accounting/disputes`, added to `routes/manifest.tsx` and the
   sidebar/subnav labelled **"Disputes"**. Keep the existing settlement queue route working (additive).
2. **Unified list** (shared `ParityTable`, centered + sortable columns, GLOBAL-TYPE-SIZE-BASELINE):
   merge the two list endpoints client-side into one normalized row —
   `{ type (Settlement | Invoice | …), entity_kind, entity_id, entity_label, counterparty (driver or
   customer), reason_code, reason_text, amount_cents, status, opened_at, resolved_at }`.
   Columns: **Type · Reference (drill-through via `EntityLink`; settlement shows its AlwaysTrack
   `source_document_ref` via `settlementLabel()`, NEVER an `S-` counter) · Counterparty · Reason ·
   Amount · Status · Opened · Resolved · Actions.**
3. **Filters:** Type (All / Settlement / Invoice / …), Status, and a text search. Picker dismisses on
   outside click.
4. **"Open dispute" action → modal:** first pick **Type**, then the target entity (settlement picker or
   invoice picker), then the reason code (from that type's enum), amount, and notes → calls the correct
   EXISTING open endpoint (invoice: `POST /api/v1/accounting/invoices/:id/disputes`; settlement: the
   existing settlement-dispute submit). **No new write path, no new money math.** Invoice disputes stay
   **tracking-only** (never mutate `accounting.invoices`; the invoice stays at its billed amount and the
   A/R balance stays OPEN for the delta — owner ruling). Settlement disputes keep their existing
   start-review → decide (corrective JE) path.
5. **Resolve/act inline:** invoice rows → resolve/cancel via the invoice-dispute endpoints; settlement
   rows → start-review/decide (may deep-link into the existing decide modal).
6. **Roles:** READ = Owner/Administrator/Accountant/Manager/Dispatcher; WRITE = Owner/Administrator/Accountant.
7. **"Any type of dispute" — extensibility:** the row `type` is a discriminator backed by a small
   registry so future dispute kinds plug in (e.g. **bill dispute**, **factoring chargeback dispute**)
   without another one-off screen. Ship Settlement + Invoice now; leave the registry seam + a disabled
   "Other" placeholder wired for the next type.
8. **UI LOCKED:** `docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md` exactly — body 12px, headers
   11px/700/UPPERCASE/`#4B5563`, 2px radius (`rounded-sm`), 1px `#E5E7EB` borders, navy rail `#14314F`,
   green `#16A34A`, centered sortable headers + centered values, 28px clickable boxes. Do not invent a scale.

### C.9 — ENDPOINT CONTRACTS + FILE MAP (measured from live code — build against THESE)

**Settlement disputes (office queue — the path used today; `decide` posts a corrective JE).**
`apps/backend/src/accounting/disputes.routes.ts` → `settlement-disputes-p6.service.ts`. Read roles
Owner/Administrator/Accountant/Manager/Dispatcher; write roles Owner/Administrator/Accountant.
- `GET /api/v1/disputes?operating_company_id=&status?=&driver_id?=&limit=&offset=` → `{ disputes, total, limit, offset }`. Omit `status` (or `all`) = every status. Row (`SettlementDisputeQueueRow`, `apps/frontend/src/api/disputes.ts`): `id, settlement_id, settlement_line_id, driver_id, driver_name, settlement_display_id (⚠ ALREADY = source_document_ref — render via settlementLabel()), reason_code, reason_text, claimed_adjustment_cents, submitted_at, status (submitted|under_review|approved|denied|withdrawn), reviewer_user_id, reviewed_at, resolution_text, adjustment_cents, adjustment_journal_id`.
- `POST /api/v1/disputes/:disputeId/start-review?operating_company_id=`
- `POST /api/v1/disputes/:disputeId/decide` body `{ operating_company_id, decision:"approved"|"denied", resolution_text(≥10), adjustment_cents? }` — **posts corrective JE on approve** (`E_CORRECTIVE_JE_ACCOUNTS_MISSING` if unconfigured). **Keep on this path; never re-implement the money move.**
- Create (open one): `POST /api/v1/driver-finance/settlement-disputes` body `{ operating_company_id, settlement_id, driver_id, dispute_category (missing_pay|wrong_deduction|miscalculated_mileage|wrong_rate|detention_not_paid|cash_advance_dispute|fine_dispute|escrow_dispute|other), dispute_description(≥20), disputed_amount_cents?, evidence_file_ids? }` → `{ data:{ id } }`. FE `openSettlementDispute` in `api/driverFinance.ts`; categories in `pages/driver-finance/settlementDisputeCategories.ts`.

**Invoice disputes (tracking-only, NO GL, NO UI today — build the UI).**
`apps/backend/src/accounting/invoice-disputes.{routes,service}.ts`, table `accounting.invoice_disputes`,
flag `INVOICE_DISPUTE_ENABLED` (ON for USMCA). Read roles Owner/Administrator/Accountant/Manager/Dispatcher;
write roles Owner/Administrator/Accountant.
- `POST /api/v1/accounting/invoices/:id/disputes` body `{ operating_company_id, disputed_amount_cents(>0, ≤ invoice face), expected_amount_cents?, reason_code (mis_entry|customer_discount|late_fine|driver_no_answer|short_pay|chargeback|other), reason_text? }` → `201 { dispute }`. One open dispute per invoice (`open_dispute_exists`).
- `GET /api/v1/accounting/invoices/:id/disputes?operating_company_id=` → `{ disputes }`
- `GET /api/v1/accounting/invoice-disputes?operating_company_id=&status?=(open|resolved|cancelled|all)` → `{ disputes }`; row = `InvoiceDisputeRow` + `invoice_display_id` + `customer_name`: `id, invoice_id, customer_id, disputed_amount_cents, invoiced_amount_cents, expected_amount_cents, reason_code, reason_text, status (open|resolved|cancelled), resolution_type, resolution_text, resolution_amount_cents, resolution_ref_id, opened_at, resolved_at`.
- `POST /api/v1/accounting/invoice-disputes/:id/resolve` body `{ operating_company_id, resolution_type (invoice_corrected|credit_memo|collected_in_full|written_off|no_change), resolution_text?, resolution_amount_cents?, resolution_ref_id? }`
- `POST /api/v1/accounting/invoice-disputes/:id/cancel` body `{ operating_company_id, reason(5–500) }`
- Enums exported: `INVOICE_DISPUTE_REASONS`, `INVOICE_DISPUTE_RESOLUTIONS`. **Never mutate `accounting.invoices`** — resolution routes to existing posters (credit memo / invoice edit).

**Live data (Neon `br-fancy-credit-akjnd07a`, USMCA):** two OPEN invoice disputes exist — invoice **13581**
(short_pay $1,600 of $4,900) and **13586** (short_pay $300 of $3,600). `driver_finance.driver_settlement_disputes`
is **empty** for USMCA — a live settlement-dispute screenshot needs an OWNER-created dispute first; **do NOT
seat-fixture one** (NO-SEAT-PROD-FINANCIAL-FIXTURES law).

**Normalized unified row** (map both list endpoints, `status=all`, concat):
```ts
type DisputeType = "settlement" | "invoice";
type UnifiedDisputeRow = {
  id: string; type: DisputeType;
  entity_kind: "settlement" | "invoice"; entity_id: string;
  entity_label: string;                 // settlementLabel({source_document_ref}) | invoice_display_id
  counterparty_kind: "driver" | "customer"; counterparty_id: string | null; counterparty_label: string;
  reason_code: string; reason_text: string | null;
  amount_cents: number | null;          // claimed_adjustment_cents | disputed_amount_cents
  status: string;                       // raw per-type status (pill)
  status_bucket: "open" | "resolved" | "cancelled"; // settlement submitted/under_review→open, approved/denied→resolved, withdrawn→cancelled; invoice 1:1
  opened_at: string; resolved_at: string | null;    // submitted_at|opened_at ; reviewed_at|resolved_at
};
```

**FE file map (exact insertion points):**
- **CREATE** `apps/frontend/src/api/invoice-disputes.ts` (client for the 4 invoice-dispute endpoints — none exists today).
- **CREATE** `apps/frontend/src/pages/accounting/DisputesHubPage.tsx` (unified list + Open-dispute modal: type picker → reuse `openInvoiceDispute`/`openSettlementDispute`; + invoice resolve/cancel modal; settlement act = deep-link to existing `/accounting/dispute-queue`).
- **REUSE (don't modify):** `api/disputes.ts` `listDisputeQueue`, `components/parity/ParityTable`, `components/shared/EntityLink` (kinds `settlement`+`invoice` both exist), `lib/settlementNumber.ts` `settlementLabel`, `lib/entity-label.ts`, `components/Combobox`, `components/forms/MoneyInput`, `components/drivers/DriverPickerWithCreate`, `api/accounting.ts` `listInvoices({has_balance:true})` (invoice picker), `api/driverFinance.ts` `listSettlements`, `pages/accounting/AccountingSubNavWrapper`.
- **ROUTE:** `apps/frontend/src/routes/manifest.tsx` — lazy import beside line ~303 (`DisputeQueuePage`); add `<Route path="/accounting/disputes">` right after the existing `/accounting/dispute-queue` block (~lines 4126–4133). **Keep the existing route (additive, Rule 07).**
- **NAV:** `apps/frontend/src/pages/accounting/subnav-manifest.ts` — add `{ label:"Disputes", path:"/accounting/disputes", section:"more" }` to `SUBNAV_ITEMS` (next to "Dispute queue" ~line 129; `childrenOf("more")` auto-sorts). **Do NOT rename/remove "Dispute queue".**

**GUARD:** `scripts/verify-dispute-window-unified.mjs` — FAILS if the hub route/nav is missing, if either
dispute type is not listed, if an invoice-dispute write path mutates `accounting.invoices`, or if a
settlement reference renders an `S-` counter instead of `source_document_ref`. Wire into money gate.

### C.10 — SETTLED DECISIONS (Cursor lead, 2026-09-13 — build to these; do not re-open)
1. **Window length = NONE.** A dispute opens when discovered and stays **OPEN until resolved or
   cancelled** — that is the entire point of the owner ruling (*"this way the balance is open and we can
   figure and fix"*). No filing deadline, no auto-expiry, no auto-close. The queue shows `opened_at`
   aging for operational visibility only; it never auto-resolves. (Owner may later add an SLA *alert*
   overlay — never a hard close.)
2. **Hold = the disputed amount only; the document is NEVER written down.** An open dispute is a
   **tracking overlay**, not a balance freeze/block. **Invoice:** the invoice stays at its full billed
   amount and its **entire A/R balance stays open** until resolved — we do NOT reduce it to what was
   collected; the dispute records only `disputed_amount_cents` (the delta); customer payments still post
   against the invoice normally; resolution (`invoice_corrected` / `credit_memo` / `collected_in_full` /
   `written_off` / `no_change`) is what finally moves the balance. **Settlement:** the dispute tracks
   only `claimed_adjustment_cents`; `decide` posts a corrective JE — it does **not** freeze the driver's
   whole net. Nothing about a dispute holds or blocks the full document.
3. **Who may resolve = Owner / Administrator / Accountant** (open, resolve, cancel for invoice; submit,
   start-review, decide for settlement). **Manager / Dispatcher = read-only.** Already enforced in both
   backends — do not widen or narrow it.

### C.11 — OVER-PAYMENT **AND** UNDER-PAYMENT BOTH OPEN A DISPUTE (owner ruling 2026-09-13)
Owner verbatim: *"when there is an over payment or underpayment, it must also go to dispute, so we can
know there is or was an issue with a load."* A dispute is the **permanent record that a load had a money
issue** — in either direction.
- **Rule:** whenever what was **collected/purchased ≠ what we invoiced** (Faro purchase ≠ invoice face,
  or a customer payment ≠ invoice face), **open an invoice dispute for the variance** — underpayment
  (they paid less) *and* overpayment / under-billing (they paid or Faro purchased more than we billed).
  The invoice is still never written down; the A/R stays open; the dispute records the delta and its
  direction so the issue is visible and traceable to the load.
- **Reason codes — extend the enum both ways.** Keep the underpayment set (`short_pay`,
  `customer_discount`, `late_fine`, `driver_no_answer`, `chargeback`, `mis_entry`, `other`) and **ADD**
  `over_payment` (collected/purchased > invoiced) and `under_billing` (we invoiced less than the load's
  true/Faro amount). Direction is also derivable from `expected_amount_cents` vs `invoiced_amount_cents`.
- **Validation change:** today the open endpoint caps `disputed_amount_cents ≤ invoice face` — that
  blocks the overpayment/under-billing direction. Relax it so `expected_amount_cents` MAY exceed
  `invoiced_amount_cents` and `disputed_amount_cents = abs(expected − invoiced)`; keep `> 0`.
- **Apply now:** open disputes for the two confirmed under-billings **13578 (+$560)** and **13589 (+$30)**
  (reason `under_billing`) so they stop living as "residual owner workflow" and become tracked issues.
  Resolution (`invoice_corrected` — raise the invoice) stays the owner money workflow; the dispute is the
  tracking record. Guard `verify-dispute-window-unified.mjs` asserts a dispute exists for every Faro-vs-face
  variance.
  **APPLIED 2026-09-13 (owner-ordered, live on the USMCA branch):** dispute **437bda1f** (13578 +$560,
  expected $5,210) and **12b7313a** (13589 +$30, expected $4,150) opened via
  `scripts/ops/cursor-2026-09-13-open-underbilling-invoice-disputes.ts`, reason `mis_entry` (the
  `under_billing` code + `expected>face` validation relax remain the seat's enum task). Invoice faces
  untouched ($4,650 / $4,120), A/R open. **All four USMCA invoice disputes are now OPEN:** 13581 (−$1,600),
  13586 (−$300), 13578 (+$560), 13589 (+$30) — both directions, invoices never written down.

---

## PART D — SEAT ASSIGNMENTS (VERDICT FORMAT — measured target · rule · one guard · UTC deadline · surrender)

Each seat: build in its lane, prove penny-exact on the Neon branch, ship one Cursor-style PR with the full
evidence block + a named guard, FAST WEEKEND MERGE. **Deadline: 2026-09-15 23:59 UTC.** Surrender: a missed
row is reassigned by the lead and the surrendering seat keeps only its money/GL lane.

| Seat | Rows | Measured target | Guard |
|---|---|---|---|
| **CC-1** (money/GL) | B4 net-pay to signed TOTAL DUE (fix 5801/5802/5803 net $0) · B5 re-post via canonical **Bill+BillPayment** (not single-JE) incl. Pedro/5772 full $997.08 | each USMCA settlement net = signed doc TOTAL DUE; 0 rows posted via `closeSettlementPayRun` | `verify-settlement-net-matches-signed-doc.mjs` |
| **CC-2** (driver-finance/settlements/fuel) | B1 fuel → `fuel.fuel_transactions` (1 row/receipt) + de-dup · B5 1:1 re-cut of the 9 misgrouped mega-rows to `source_document_ref` · B6 bill→settlement links | `fuel.fuel_transactions` USMCA rows > 0 & = document receipt count; 0 mega-rows carrying >1 tour; `settled_in_settlement_id` non-null on every USMCA bill | `verify-fuel-transactions-per-load.mjs` + `verify-settlement-recut-1to1.mjs` |
| **CC-3** (dispatch/ingest support) | B2 per-load expense lines (136 short) · B3 miles ingest · B7 cutover-flag fixes (7 loads + 13579 sample flag) | 0 USMCA expense lines with `line_category='(none)'` & null `load_id` for ingested docs; 0 USMCA loads mis-flagged across the 08-07 boundary | Part A `verify-usmca-settlement-cutover.mjs` |
| **CC-2 or assigned FE seat** | PART C dispute window (unified hub, both types, open/resolve, route+nav, extensibility) | hub lists Settlement + Invoice disputes incl. 13581/13586; invoice writes never touch `accounting.invoices` | `verify-dispute-window-unified.mjs` |
| **Cursor (lead)** | authored this doc + Part A absorption guard skeleton; coordinates seats, re-measures each DONE; does NOT build the seat features | — | — |

**Absorption (Part A) is a precondition for CC-1/CC-2/CC-3:** classify each tour by the END ≥ 08-07
predicate first, then ingest all legs of every USMCA (incl. straddling) tour. Record any complex logic in
`docs/MEMORY_BANK.md` before closing a session (Rule 51).

**Prod money re-post stays owner-gated:** build + prove on the branch; the owner presses go for the live
settlement re-post (MEMORY_BANK). Everything else merges on green.
