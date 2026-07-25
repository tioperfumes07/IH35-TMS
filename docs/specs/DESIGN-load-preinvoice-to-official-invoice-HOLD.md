# DESIGN — Load PRE-INVOICE (on book) → OFFICIAL INVOICE (on deliver) · TONU fee MANUAL (HOLD)

> **STATUS: DESIGN ONLY · BUILD-AND-HOLD · DO NOT MERGE.**
> This document is **doc-only**. It contains **NO migration, NO money code, NO flag flip, NO account seed.**
> It is the planning artifact for a **future** implementation PR that will itself be a financial-cluster PR
> (`build-and-HOLD`; owner `JORGE-APPROVED` + owner Neon-apply required — Rule 13, `.cursor/rules/13`).
> Cursor never merges this; it is left **open** for the Claude coder / owner ceremony.
>
> - **Author role:** Planner (multi-agent orchestration, Rule 11). Builder / Financial-Accounting / GUARD are **separate** agents on the future PR. The Planner writes no GL math.
> - **Branch:** `docs/load-preinvoice-official-invoice-hold` (fresh from `origin/main` @ `d8370fe83`).
> - **Spec sources (Rule 01):** `IH35_MASTER_BLUEPRINT_v3_FULL.md`, `IH35_UNIFIED_BLUEPRINT_ADDITIONS.md`, `IH35_ARCHITECTURAL_DESIGN.md`; Law of the Land `ARCHITECTURE-BLUEPRINT-2026-07-05.md`; CPA locks `.claude/skills/ih35-accounting-decisions`; never-delete `.cursor/rules/07`.
> - **Companion designs (reuse, do not duplicate):** `DESIGN-load-revenue-capture-auto-invoice-tonu.md`, `DESIGN-tonu-cancellation-ar-and-accessorial-coa-HOLD.md`, `DESIGN-cpa-step3-coa-role-map-CORRECTED-HOLD.md`.
> - **Doc-only exception:** Rule 02 §Exception — this commit touches no code logic.

---

## 0. Owner rulings recorded — 2026-07-21 evening (verbatim intent, authoritative)

These are the owner decisions this design implements. Recorded exactly; where a ruling names a reality that
conflicts with the books treatment, both are documented (fix-not-patch honesty, Rule 16).

1. **Load booked → PRE-INVOICE (automatic).** A pre-invoice is generated automatically when a load is booked,
   for **cash-flow projections**. It is **not yet sent to the customer** and is **not** the AR invoice.
2. **Load delivered → OFFICIAL invoice (automatic).** On delivery the system generates the **official** invoice —
   this **becomes the real A/R invoice and is sent to the customer.**
3. **Broker cancel / TONU fee — NOT automatic.** The operator decides whether a fee is charged (depends on the
   customer, relationship, etc.). When billed, presentation = **accessorial operating revenue** (already ruled).
   The design **may reuse** the TONU→AR design (`#3103` merged), but the **billing trigger is manual /
   owner-decision — never auto on cancel.**
4. **Unmapped invoice line:** the system **designates the revenue role first (fail-closed)**; the default
   account is **Line Haul / Freight Service** (whichever the CoA actually uses — **verify which exists on
   Neon / TRANSP; do not invent a name**).
5. **Faro = both** a `factoring.factor` card **AND** an `mdata.vendors` row.
6. **Damage Claim Escrow = long-term liability presentation** (owner expectation: drivers stay years) —
   **BUT note the reality:** on separation, payback is ~90 days, which is short-term in fact. The tension is
   documented; **owner chose long-term for the books.**
7. **Segregation of Duties (SoD):** **Owner, Admin, and Accountant MAY approve AND post** (the same person is
   allowed for those roles) — **not** a hard DB same-user block for those three roles.
8. **Scope IN:** lending / risk module · process dashboard · calibration · doc-control · commodity catalog
   (commodity on invoice) · Faro debtor credit-check UI.
   **Scope OUT:** OSHA · HTS / tariff · navy→green CTA color changes.

> **This document covers ruling #1–#4 (the two-event invoice model + TONU-manual + unmapped-line fail-closed).**
> Rulings #5–#8 are recorded here for the record and cross-referenced to their owning designs; they are **not**
> implemented by the future PR this doc gates (see §11 Non-goals / cross-refs).

---

## 1. Problem statement (why this is the correct, non-patch fix)

Two distinct business needs, one lifecycle:

1. **Cash-flow projection at booking.** The moment a load is booked, the company knows revenue is *expected*.
   Finance needs that expected amount visible **immediately** for cash-flow forecasting — before any customer
   is billed and before revenue is earned. Today there is no booked-stage projection artifact.
2. **Reliable billing at delivery.** A delivered load must **automatically** become the customer invoice (A/R),
   not depend on someone remembering. (This is the money-leak already documented in
   `DESIGN-load-revenue-capture-auto-invoice-tonu.md`.)

The **root cause** is a missing two-event lifecycle: (a) a non-posting **PRE-INVOICE projection** at book, and
(b) an auto-posting **OFFICIAL invoice** at deliver. The correct fix ships the lifecycle + reuse of the existing
poster + fail-closed role resolution + guards + live proof — gated OFF by default, owner-applied. No patch.

### 1.1 How the target systems do it (Rule 15 research mandate)
- **McLeod / Alvys:** the customer invoice is generated **off the load lifecycle** (at delivery / POD-received),
  not by hand; a booked/quoted amount is tracked for forecasting before it becomes a billed invoice.
- **QuickBooks:** an **Estimate** (non-posting) precedes the **Invoice** (posting, A/R). The Estimate is a
  projection; only the Invoice hits the ledger. Our **PRE-INVOICE maps to the Estimate concept** (non-posting),
  our **OFFICIAL invoice maps to the Invoice** (posting).
- **NetSuite:** uses a contract-asset (unbilled) position between earning and billing; our locked
  **two-event revenue latch** (see §3.3) already encodes the earn-vs-bill separation.

---

## 2. The two-event model (booked = pre-invoice / delivered = official)

### 2.1 Event A — Load booked → PRE-INVOICE (automatic, **non-posting projection**)
- **Trigger:** load reaches `booked` (dispatch load state machine — reuse existing transition, add no new lifecycle).
- **Artifact:** a **PRE-INVOICE** projection derived from the booked rate (line-haul + known accessorials +
  fuel surcharge), attributed to the load's customer and `operating_company_id`.
- **CRITICAL — no GL, not sent:** the pre-invoice **posts nothing to the ledger** and is **never transmitted to
  the customer.** It is a **cash-flow projection** only (the QuickBooks *Estimate* analogue). Revenue is **not**
  recognized at booking (ASC 606 control has not transferred; that would overstate revenue). This keeps the
  books honest and is the conservative reading (Rule 06 hardline).
- **Purpose:** feed the **cash-flow projection / expected-revenue** views so finance sees pipeline the instant
  a load is booked.
- **Mutability:** the pre-invoice tracks the load — if the booked rate changes before delivery, the projection
  updates. It is a forecast, not a financial record; it carries no permanent-record void obligation (nothing
  posted). Superseded by the official invoice at delivery.

### 2.2 Event B — Load delivered → OFFICIAL invoice (automatic, **posting, sent to customer**)
- **Trigger:** load reaches `delivered` (POD / `completed_docs_received`) via the existing load state machine.
- **Action:** create the **official** customer invoice from the load (customer, line-haul = GROSS rate,
  accessorials, fuel surcharge) via the **existing** invoice-create path, then post via the **existing** poster.
  This is the **real A/R invoice** and is the document sent to the customer.
- **This event carries the ledger posting** (reusing the locked two-event revenue latch, §3.3) — **not** the
  pre-invoice.
- **Supersession:** the official invoice supersedes the pre-invoice projection for the same load; the projection
  is marked *realized* and drops out of the "expected / not-yet-billed" forecast.
- **Idempotency:** deterministic key `load:{loadId}:invoice` + unique index → a load can never double-invoice
  (same discipline as `buildInvoiceFromLoad` returning the existing invoice for a `source_load_id`).

### 2.3 Why pre-invoice is NOT a posting event (guardrail)
Booking is **not** a revenue-recognition trigger. If the pre-invoice posted, the company would recognize revenue
(or A/R) before earning it — an ASC 606 violation and a direct audit/CPA finding. The pre-invoice is therefore
a **projection artifact with zero GL side effects**, and a guard (§7) asserts the booked path writes **no**
`accounting.journal*` and calls **no** poster.

---

## 3. Reuse the existing invoice poster — write NO new GL math (Rule 13)

### 3.1 Existing infra to REUSE (verified on `origin/main` @ `d8370fe83`)
- `apps/backend/src/accounting/from-load.ts` (`buildInvoiceFromLoad`) — creates `accounting.invoices` +
  `accounting.invoice_lines`, resolves the revenue account via `resolveInvoiceLineRevenueAccountId` →
  `resolveAccountForCategory`, recomputes totals, emits audit. **The official-invoice path (Event B) reuses this.**
- `apps/backend/src/accounting/posting-engine.service.ts` (`postSourceTransaction`) — the balanced-JE poster.
  **No new journal-entry math is authored.**
- The locked **two-event revenue latch** (§3.3) — already designed; not re-derived here.

### 3.2 The PRE-INVOICE path adds NO poster call
Event A must **not** call `buildInvoiceFromLoad` in a posting mode nor `postSourceTransaction`. The pre-invoice
is stored as a projection (its storage surface is an implementation choice for the future PR — e.g. a
`pre_invoice`/estimate-flavored row or a projection table — additive, non-financial-posting). The guard enforces
zero GL.

### 3.3 OFFICIAL-invoice GL (locked two-event latch — reused, not redefined)
Per the locked revenue-recognition decisions (`IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` §revenue-recognition
two-event latch):
- **Earn @ delivery:** DR **Unbilled Revenue** (current asset) / CR **Line-Haul Income**.
- **Bill @ invoice / POD:** DR **A/R** / CR **Unbilled Revenue**.
- **HARD prerequisite (already documented, restated):** the **Unbilled Revenue account does not exist on prod**
  (only Deferred Revenue exists, TRANSP, verified 2026-07-19). Seeding Unbilled Revenue for **TRANSP + USMCA** is
  a **required finance-gated step** (owner Neon apply) before the official-invoice posting flag may flip. **TRK
  excluded.** This design does **not** seed it (doc-only); it names it as a gate.

---

## 4. Unmapped invoice line — designate role first, fail-closed (ruling #4)

- The revenue account for every invoice line is **never guessed.** The line's revenue role is **designated
  first**; if undesignated, the path **fails closed** (no silent shape-fallback pick) — the same defense that
  fixed the "A/R debited to Unauthorized Expenses" bug.
- **Default account** (once a role is designated but no explicit account override exists): **Line Haul / Freight
  Service** — **whichever name the CoA actually uses.** The future PR must **verify on Neon / TRANSP which
  account exists** (e.g. TRANSP `4100 Freight Revenue` vs a `Line Haul` / `Freight Service` label) and bind the
  role to the **real** account. **Do not invent an account name or number** (Rule 10 — prod wins).
- **Resolution source of truth:** the **PRIMARY** role table is **`accounting.chart_of_accounts_roles`**
  (per-opco `role → account_id`, soft-versioned, audited), read **first** by
  `apps/backend/src/accounting/coa-roles/resolver.service.ts` (`resolveMappedRoleAccount`). The legacy
  `catalogs.account_role_bindings` is the **fallback only** — **the future PR points at
  `chart_of_accounts_roles`, not the legacy bindings** (see §6).

---

## 5. TONU / broker-cancel fee — explicitly NOT automatic (ruling #3)

- A broker cancellation / TONU fee is **operator-decided.** There is **no** automatic invoice on load cancel.
  The billing trigger is **manual / owner-decision**, full stop.
- When the operator **does** decide to bill a TONU fee, the billed amount is presented as **accessorial
  operating revenue** (already ruled) and may **reuse** the merged TONU→AR design (`#3103`): the same
  invoice-create + poster path, booking to the accessorial/TONU revenue role via `chart_of_accounts_roles`.
- **Guard (§7)** asserts the cancellation path does **not** auto-create an invoice — the fee path is only ever
  reachable through an explicit operator action, never as a side effect of `cancelLoad`.

> This is the sharp distinction from Event B: **delivery auto-invoices; cancellation does not.** Delivery is a
> completed service (earned); a cancellation fee is a discretionary accessorial the operator elects to bill.

---

## 6. Role designations via `chart_of_accounts_roles` PRIMARY (owner designates)

- The system **never guesses** the freight / accessorial / A/R / Unbilled accounts. The owner designates them
  through the **existing** admin surface: `CoaRolesPage.tsx` → PUT `/api/v1/accounting/coa-roles` → upsert into
  **`accounting.chart_of_accounts_roles`** (deactivate prior, insert new, audit). The resolver reads that table
  **first**; `catalogs.account_role_bindings` is legacy fallback only.
- **Fail-closed control roles:** `ar_control` (and `ap_control`) fail closed when >1 candidate — keep this.
- **Prerequisite (reachability):** confirm the CoA-roles admin surface is **mounted and reachable** in prod
  before the official-invoice path relies on it. If a new freight/line-haul revenue role value is added to the
  resolver's role set, the admin page must render it and the validate endpoint must include it.
- **Do NOT re-point at legacy `account_role_bindings`** for new designations. Primary table only.

---

## 7. Guard plan — Rule 17 compliant (NO hot-file thrash · NO package.json edit)

Per `.cursor/rules/17`: add `scripts/verify-<name>.mjs` **and** `scripts/verify-steps/<NNN>-verify-<name>.mjs`
that `export default { name, run(ctx) { ctx.run("node", ["scripts/verify-<name>.mjs"]) } }`.
**Do NOT** edit `package.json`, `.github/workflows/locked-guards.yml`, or `.github/workflows/ci.yml`.
`verify:pre-commit` auto-discovers steps. Per Rule 18, `ctx.run` throws on failure; each guard embeds a
`--selftest` of planted pass/fail fixtures.

**Next free step numbers are `1209+`** (highest existing step on `origin/main` @ `d8370fe83` is `1208`).

Verify-step file shape:

```js
export default {
  name: "verify:load-preinvoice-nonposting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-preinvoice-nonposting.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-preinvoice-nonposting.mjs"]);
  },
};
```

Proposed guards (future PR):

| Step | Guard file | Asserts |
|---|---|---|
| `1209-verify-load-preinvoice-nonposting.mjs` | `scripts/verify-load-preinvoice-nonposting.mjs` | The booked→pre-invoice path writes **no** `accounting.journal*` and calls **no** poster (`postSourceTransaction`/`buildInvoiceFromLoad` posting mode); pre-invoice is a projection, not sent to customer. |
| `1210-verify-load-delivered-auto-official-invoice.mjs` | `scripts/verify-load-delivered-auto-official-invoice.mjs` | The delivered path creates the official invoice via `buildInvoiceFromLoad` + existing poster (no new GL math); idempotent per `load:{id}:invoice`; behind a flag defaulting OFF. |
| `1211-verify-invoice-line-role-fail-closed.mjs` | `scripts/verify-invoice-line-role-fail-closed.mjs` | Invoice-line revenue resolves only from an explicit designation in `chart_of_accounts_roles` (PRIMARY, not legacy bindings); fail-closed when undesignated; default binds to the **real** Line-Haul/Freight-Service account (no invented name). |
| `1212-verify-cancel-not-auto-tonu.mjs` | `scripts/verify-cancel-not-auto-tonu.mjs` | `cancelLoad` does **not** auto-create an invoice/charge; the TONU fee is reachable only via an explicit operator action. |

(The existing `scripts/verify-hold-merge-gate.mjs` already blocks the future PR from merging without
`JORGE-APPROVED` — it is financial/migration/flag-flip.)

---

## 8. Flag defaults — OFF until owner Neon / ops ready

- **`LOAD_OFFICIAL_INVOICE_ON_DELIVER_ENABLED`** — gates Event B auto-invoice. **Default OFF**, per-entity
  override only. OFF = today's behavior (no auto-invoice on deliver). ON (per entity) only after: Unbilled
  Revenue account seeded (TRANSP/USMCA), CoA roles designated, CPA sign-off, Neon tie-out.
- **`LOAD_PREINVOICE_PROJECTION_ENABLED`** — gates Event A pre-invoice projection generation. **Default OFF.**
  Because Event A posts nothing, its risk is display-only, but it stays OFF until the projection surface is
  wired and verified.
- Flag flips to ON are themselves **HOLD** events (the hold-merge-gate detects `*_ENABLED → true`). Owner flips;
  never a script/token in an unattended run.
- **TRK excluded** from both flags (lease lessor, 0 freight loads).

---

## 9. Linkage matrix — load ↔ pre-invoice ↔ official invoice ↔ customer ↔ JE (Law of the Land §9)

Forward + reverse; entity-scoped (`operating_company_id`, FORCED RLS); audit on every mutation.

| From | To | Mechanism | Posting? |
|---|---|---|---|
| `mdata.loads` (booked) | PRE-INVOICE projection | `pre_invoice.source_load_id` (**NEW**, additive) | **No GL** (projection) |
| PRE-INVOICE projection | `mdata.customers` | customer_id carried from load | No |
| PRE-INVOICE projection | OFFICIAL invoice | supersession link `pre_invoice.realized_invoice_id` (**NEW**) | n/a |
| `mdata.loads` (delivered) | `accounting.invoices` (OFFICIAL) | existing `buildInvoiceFromLoad` (`source_load_id`) | **Yes** — official |
| `accounting.invoices` | `mdata.customers` | `invoices.customer_id` (existing) | — |
| `accounting.invoice_lines` | `mdata.loads` | `invoice_lines.source_load_id` (existing) | — |
| `accounting.invoice_lines` | `catalogs.accounts` (Line-Haul/Freight + accessorial) | revenue resolver via `chart_of_accounts_roles` (PRIMARY) | — |
| `accounting.invoices` | `accounting.journal_entries` | existing invoice A/R poster + two-event latch | **Yes** |
| all of the above | `audit.audit_events` | append-only audit on every mutation (existing helper) | — |

No dead-end screen, no orphan row: the booked load shows its pre-invoice projection; the delivered load shows
its official invoice; the invoice line links back to the load + customer + JE; the pre-invoice links forward to
the invoice that realized it.

---

## 10. Acceptance[] (future implementation PR — evidence before done, Rule 10 / 16)

Each item must resolve on **live evidence**. CI-green ≠ done; merged ≠ done; deployed ≠ live until
`/api/v1/healthz/shallow` `version` == merge SHA.

1. **Pre-invoice posts nothing:** with `LOAD_PREINVOICE_PROJECTION_ENABLED` ON in a test entity, booking a load
   creates a pre-invoice projection and writes **zero** `accounting.journal*` rows (Neon query, RLS bypass);
   no customer transmission occurs. Guard `1209` proves it and fails on a planted GL write.
2. **Official invoice auto-created on deliver:** with `LOAD_OFFICIAL_INVOICE_ON_DELIVER_ENABLED` ON in a test
   entity, delivering a load creates exactly one invoice via `buildInvoiceFromLoad`, posts a balanced JE
   (debits=credits) through the existing poster + two-event latch, and marks the pre-invoice realized. Idempotent
   on retry (no double invoice). Guard `1210`.
3. **Flags OFF = no behavior change:** with both flags OFF, booking and delivering a load produce **no**
   pre-invoice and **no** auto-invoice (byte-for-byte today's behavior). Guards `1209`/`1210` prove it.
4. **Unmapped line fails closed:** an invoice line whose revenue role is undesignated **fails closed** (no
   silent account pick); once designated in `chart_of_accounts_roles`, it resolves to the **real** Line-Haul /
   Freight-Service account (verified to exist on Neon / TRANSP — no invented name). Guard `1211`.
5. **Cancel is NOT auto-TONU:** cancelling a load creates **no** invoice/charge; the TONU fee is only ever
   raised by an explicit operator action, booked as accessorial revenue via `chart_of_accounts_roles`. Guard `1212`.
6. **Reuses existing poster:** diff shows the official-invoice path calls `buildInvoiceFromLoad` / the existing
   A/R poster; **no new GL/journal math** (financial-agent confirms).
7. **Roles from PRIMARY table:** revenue/A/R accounts resolve from `accounting.chart_of_accounts_roles` (not
   legacy `account_role_bindings`); CoA-roles admin surface mounted + reachable; designations audited.
8. **Unbilled Revenue gate honored:** the official-invoice posting flag cannot flip ON until Unbilled Revenue is
   seeded for the entity (TRANSP/USMCA; TRK excluded) — verified on Neon before flip.
9. **Linkage complete (§9):** forward + reverse drill resolves on live data; no orphan pre-invoice, no unlinked
   invoice line.
10. **Guards wired (Rule 17):** guards `1209`–`1212` run in CI via verify-steps (no `package.json` /
    locked-guards / ci.yml edits) and each fails on a planted regression, passes on the fix.
11. **Deploy proof:** health `version` == merge SHA; all of the above verified **after** deploy.

---

## 11. Non-goals / out of scope · cross-refs

- **No auto-TONU on cancel** (ruling #3) — the whole point of §5.
- **No new GL math** — reuse the existing poster (Rule 13).
- **No migration, no money code, no flag flip, no account seed** in this doc (doc-only).
- **No reserve-account seed / balance-sheet move.** Reserve accounts are **owner-manual only** (owner ruling
  2026-07-21, "rule 19"). The factoring-reserve subtype mess (§1.6 of
  `DESIGN-tonu-cancellation-ar-and-accessorial-coa-HOLD.md`) stays a **separate owner ruling**; no reserve
  seeds here.
- **No TMS→QBO write-back** (parallel books; QBO reconcile-only — CPA lock).
- **No deletion/rename** of any account, tab, module, or surface (Rule 07).
- **Rulings #5–#8 recorded, not built here:**
  - #5 **Faro = factor card + vendor row** → owning surfaces: `factoring.factor` + `mdata.vendors` (separate block).
  - #6 **Damage Claim Escrow = long-term liability (books) / ~90-day short-term (reality)** → escrow-liability design (separate block); tension documented in §0.
  - #7 **SoD: Owner/Admin/Accountant may approve AND post** → maker/checker config (already aligned with the revenue-recognition maker/checker note; not a hard DB same-user block for those roles).
  - #8 **Scope IN/OUT** (lending/risk, process dashboard, calibration, doc-control, commodity catalog + commodity-on-invoice, Faro debtor credit-check UI; OUT: OSHA, HTS/tariff, navy→green CTA) → separate blocks; only *commodity-on-invoice* touches the invoice surface and is noted for the future invoice-line PR.

---

## 12. Handoff / next steps

1. Owner reviews this design + §0 rulings; records any new spec in `IH35_UNIFIED_BLUEPRINT_ADDITIONS.md`
   (append-only) and `docs/lockdown/00_LOCKED_DECISIONS.md` as appropriate.
2. Confirm the **Line-Haul / Freight-Service** account name/number that actually exists on Neon / TRANSP
   (ruling #4) — bind the role to the real account; do not invent.
3. Confirm the CoA-roles admin surface is mounted (PRIMARY-table designations reachable).
4. Confirm the Unbilled Revenue seed status (TRANSP/USMCA) — hard gate before the official-invoice flag.
5. Financial/Accounting agent (CPA skill) reviews: pre-invoice non-posting, at-delivery recognition, TONU-manual.
6. Builder implements as a **single financial-cluster HOLD PR**: pre-invoice projection (non-posting) +
   auto-official-invoice-on-deliver (reuse poster) + fail-closed role resolution + guards (§7) + acceptance
   evidence (§10). Owner Neon-applies / flips flags; GUARD re-proves live.
7. **This design PR stays HOLD / do-not-merge** until the owner directs. Cursor never merges it.
