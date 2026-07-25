# IH35-TMS — Accounting Architecture (CANONICAL, locked 2026-07-02)

> **★ CURRENT CONSOLIDATED GUARDRAIL:** [`ARCHITECTURE-BLUEPRINT-2026-07-05.md`](ARCHITECTURE-BLUEPRINT-2026-07-05.md)
> is the current consolidated architecture guardrail — the **Law of the Land** total-connectivity rule, the
> driver **Bill + BillPayment** settlement model, the **Faro** exact factoring terms, the auto-provisioned
> **driver accounts** (cash-advance asset + escrow liability), the **posting flags**, and the
> **per-build-block linkage checklist**. **All builds conform to it.** This ACCOUNTING-ARCHITECTURE doc
> remains the detailed accounting source of truth; the blueprint is its consolidated, cross-module superset.

> **Single source of truth for how accounting works. If any older doc (esp. the master blueprint
> §3.12 "QBO AUTO-SYNC + REPLAY") disagrees, THIS wins.** Aligned with
> `docs/lockdown/00_LOCKED_DECISIONS.md` §8. Purpose: stop agents from rebuilding a two-way QBO sync.

## Three-layer SoR / cutover / validation model (LOCKED — additive)

Same three layers as `docs/specs/TMS-QBO-PARALLEL-BOOKS.md` and the CPA skill — do not collapse:

1. **Historical transaction authority:** QBO authoritative through **12/31/2025**; **TMS ledger authority
   begins 2026-01-01.** These dates are **not** retired by dual-run validation wording.
2. **Ch.11 operating / GL cutover:** opening balances as-of **03/31/2026**; live operating line from
   **04/01/2026** under **ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting.**
3. **Ongoing validation mode:** QBO remains **actively maintained** as the comparison / filing book; TMS
   runs independently; **reconcile-only**; **never** TMS→QBO write-back; **IMPORT-P0** / **IMPORT-P0b**
   (`QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED`) **default OFF**.

## The one-paragraph version
TMS and QuickBooks Online run as **two independent systems in parallel (double books)** under the
three-layer model above. **QBO is the system of record through 12/31/2025; TMS ledger authority begins
2026-01-01.** We **clone QBO once** — all master data, AR, AP, and GL — into the TMS database, and after
that the QBO connection exists **only to reconcile and compare** (twice daily — the two Jorge-locked
scheduled passes in `TMS-QBO-RECONCILIATION.md` §2): flag anything added, voided, or changed in either
system. **There is NO write-back from TMS to QBO and NO two-way sync.** During ongoing validation, QBO
remains actively maintained as the comparison/filing book while TMS runs independently. **QBO-PUSH**
kill-switch flips remain **event-gated** (final clone + to-the-cent tieout + book-lock) — that ceremony
governs write-back/push authority only; it does **not** retire Layer 1’s historical SoR dates (see Cutover
below).

## Why (the decision)
Owner + CPA locked this to avoid the fragility and double-entry risk of a bidirectional sync. The deeper
purpose: **run TMS in parallel to QuickBooks as a live validation harness.** Both books register the same
bank feeds, expenses, bills, and payments independently; the daily reconcile proves TMS booked every event
the same way QBO did. Under Layer 3, QuickBooks stays the actively maintained comparison/filing book while
TMS earns trust under Layer 1’s TMS ledger authority start; QBO-PUSH enablement remains a deliberate
event-gated ceremony after reconcile proves agreement — not a silent drift, and not a retirement of the
12/31/2025 / 2026-01-01 historical authority boundary.

## The rules (enforcement status noted per rule — do not assume "enforced" without the citation)

1. **Clone-once, then reconcile-only.**
   - One-time full backfill: QBO **customers, vendors, invoices, payments, bills, bill-payments, and the
     GL** → TMS tables (store-once, exact integer cents, upsert-by-QBO-id, void-never-delete).
   - Ongoing (this is the point): after the backfill, **both systems keep running in parallel and each
     INDEPENDENTLY registers the same day-to-day activity** — the same **bank transactions** are downloaded
     into both (Plaid → TMS, bank feed → QBO), the same **expenses and bills** are created in both, the
     same **payments are applied** in both. The **twice-daily reconciliation is a CORRECTNESS TEST**: it
     confirms that the same records exist, with the same amounts/dates/application, in **both** books — and
     flags anything that is in one but not the other, or that differs. Its purpose is to **prove TMS is
     registering every financial event correctly** (a live QA harness against QBO as the trusted
     reference) during the parallel run, before cutover. It is NOT a sync — nothing is copied either way at
     this stage; each side is entered independently and only compared.
   - Specs: `QBO-CLONE-PROGRAM.md` (master data + AR/AP, blocks MD-1…MD-RECON),
     `TMS-QBO-RECONCILIATION.md`, and the QBO-IMPORT GL program (IMPORT-0…4v2).

2. **No write-back to QBO** (the target state; enforcement is partial today — stated honestly below).
   - **JE path — ENFORCED (merged).** `QBO_JE_PUSH_ENABLED` (default OFF, **per-entity-only**) + a
     structural refusal of any journal entry whose `source_system != 'tms'`, on **both** push paths
     (immediate best-effort AND the every-minute queue-drain cron) via one shared gate
     (`apps/backend/src/accounting/qbo-je-push-gate.ts`; CI guard `verify-qbo-push-gates.mjs`). — IMPORT-P0
     (PR #1797, merged).
   - **Entity paths — NOT YET IN FORCE.** The six `T11.20.6.2` write-back handlers (customer / vendor /
     account / invoice / bill / item `tms.*.push_requested` → `push.service.ts`) are **default-ON via env
     var with NO origin guard today** (latent, not live — zero `tms.*.push_requested` rows exist yet).
     **IMPORT-P0b** closes this: flag `QBO_ENTITY_PUSH_ENABLED` (default OFF, per-entity-only) +
     clone-origin refusal on all six, mirroring IMPORT-P0. **Until IMPORT-P0b merges, this bullet is the
     intended state, not the current state** — do not cite it as enforced.
   - All **money-posting flags default OFF and are per-entity-only** (`POSTING_FLAG_KEYS`).

3. **Both accounting bases.**
   - Canonical imported ledger = **accrual** detail.
   - **Cash-basis is copied verbatim from QBO's own cash reports** — QBO computes it, TMS never re-derives
     cash during the QBO-SoR window. A native cash-conversion engine is a **post-cutover** block.

4. **Conversion + entities.**
   - Convert **01/01/2024** for **TRANSP** + **TRK**; opening position = **Balance Sheet as of
     12/31/2023 → Opening Balance Equity** (OBE is a temporary clearing account, expected ≈ 0; a
     permanent OBE balance is a defect → plan OBE→Retained-Earnings reclass).
   - **USMCA has no QuickBooks** → **TMS-authoritative from day one** (2026); never cloned/reconciled.
   - QBO realms: TRANSP `123145885549599`, TRK `1432746210`. Assert realm↔operating-company on the
     **unrevoked** connection only; never cross realms; per-entity RLS on every table.

5. **Factoring = secured borrowing (recourse), not a sale.** Faro today → RTS planned. Driver damage-claim
   escrow is a **liability** (held-in-trust). See `cpa-locked-decisions-2026-07-01`.

6. **Integrity invariants (every engine).** Exact cents (BigInt, never `parseFloat`); void-not-delete +
   audit; idempotent upsert by QBO id; unmatched account = abort (no guessed mapping); unbalanced = abort;
   tie out to the cent or fail loud; everything behind `QBO_HISTORICAL_IMPORT_ENABLED` (OFF),
   owner-triggered, build-and-hold, prove on a Neon branch with real pulls before any merge.

## What is RETIRED
The master blueprint §3.12 "QBO AUTO-SYNC + OFFLINE QUEUE / REPLAY" (WF-031 auto-sync on writes,
local-write-first-then-push, lockstep, replay-on-reconnect) is **superseded** and kept only for history.
Do not rebuild a two-way sync.

## Cutover — three layers (QBO-PUSH ceremony ≠ retirement of historical SoR)

**Layer 1 (historical transaction authority)** remains locked: QBO through **12/31/2025**; TMS ledger
authority from **2026-01-01**. Dual-run validation does **not** retire these dates.

**QBO-PUSH / write-back enablement** stays **EVENT-gated**, not calendar-gated: the ceremony = a final clone +
a **to-the-cent tieout** proving both books agree + a **book-lock** before any kill-switch flip. No agent may
treat a calendar date as permission to flip `QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED`. That ceremony
governs **push/write-back authority only** — it is not a statement that QBO is the indefinite sole SoT, and it
does not erase Layer 1.

> **⚑ Ch.11 operating cutover line (ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting)
> (OWNER-FINAL 2026-07-16; supersedes the prior 07/01/2026 cutover / 06/30/2026 opening lock).**
> Ch.11 was approved end of March 2026 → the books change in April, so **03/31/2026 is the operating cutover line**:
> **opening balances = QBO Balance Sheet as of 03/31/2026 per entity** (re-syncable until the owner locks them),
> and **TMS posts live in parallel + reconciles daily from 04/01/2026** (per entity, after opening tie-out). This
> is the **internal GL-posting / operating** go-live (Layer 2) — it does **not** erase Layer 1’s historical SoR
> dates, does **not** authorize TMS→QBO write-back, and leaves **QBO-PUSH** flips **EVENT-gated**. The historical
> clone conversion (`01/01/2024`) is unchanged. Apr/May/Jun 2026 move from "mirror QBO" to LIVE TMS posting
> (3 more live months than the old 07/01 line) — expected. Canonical spec:
> `docs/specs/OPENING-BALANCE-IMPORT-AND-CUTOVER-2026-07-16.md`.

## Locked owner decisions (2026-07-02 — resolved; reconciled with GUARD)
1. **`factoring_advance` JE push — GATED OFF.** It composes a QBO JournalEntry from
   `accounting.factoring_advances`; folded into the JE kill-switch (`QBO_JE_PUSH_ENABLED`, default OFF) in
   `syncEntityToQbo`, with a static guard. The Faro advance is booked in QBO via the bank feed and
   reconciled — never pushed. (IMPORT-P0b / PR #1802.)
2. **Per-entity override policy — OFF for ALL entities, EVENT-gated.** Every entity's outbound push
   (`QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED`, per-entity-only in `POSTING_FLAG_KEYS`) stays OFF
   until the **cutover ceremony** completes — NOT until a calendar date. Flipping one entity mid-window
   silently corrupts the reconciliation baseline.
3. **Driver→QBO vendor — no synchronous cross-system create.** `qbo_vendor_id` is nullable; hire completes
   instantly (best-effort fix shipped); the driver's vendor is created in QBO independently and the daily
   reconcile match links it (MD-2); settlement/1099 paths assert linkage at the moment they need it.
4. **FIN-2 finance landing — approved** (land on Hub, unify subnav, keep Overview; additive; the FIN-1
   status-honesty fix ships first/same PR).
5. **Sync bookkeeping — retire the parallel counter;** the archive projection + reconciliation exceptions
   are the only truth.
6. **Required document types — seed FMCSA/IRS regulatory defaults, warn-first,** per-type promote-to-hard-
   block, configurable per carrier (drivers: CDL / §391.41 medical / MVR / Clearinghouse / §391.21 app /
   W-9; units: reg / §396.17 inspection / IFTA / Form 2290 / insurance; customers: credit-app / W-9 / MSA /
   NOA-if-factored; vendors: W-9 / COI / agreement).
7. **Canonical Faro vendor** = QBO-linked row `3585f27e`; merge terms from `6dd1f7f5`, repoint every FK,
   VOID (never delete) the duplicate.
8. **Opening semantics — BS-only + a mandatory RE-roll boundary test in IMPORT-4v2** (pull TB 12/31/2024 &
   01/01/2025 on a Neon branch; assert the engine reproduces QBO's Retained-Earnings roll to the cent).

### Reconciliation correctness (locked — RECON-01 must implement)
- **CRITICAL:** the AM bank pass reads QBO's **real bank register** (`TransactionList`/`GeneralLedger` per
  account), NOT the sync queue (`listQboSyncConflicts`) — reading the queue compares TMS to itself.
- Bank match is **row-level** (date+amount+reference), not just count+sum — a missing + a wrong txn of the
  same amount must not net to invisible.

---
*Cross-refs: `docs/lockdown/00_LOCKED_DECISIONS.md` §8 · `docs/specs/TMS-QBO-RECONCILIATION.md` ·
`docs/specs/QBO-CLONE-PROGRAM.md` · QBO-IMPORT program blocks · auto-memory
`qbo-import-design-corrections`, `cpa-locked-decisions-2026-07-01`, `driver-escrow-is-liability`.*

---

## Driver-pay / deduction / escrow engine — LOCKED owner decisions (2026-07-04)
(Registered in `docs/lockdown/00_LOCKED_DECISIONS.md` §9; memory `[[audit-fix-decisions-2026-07-04]]`.)

**Canonical deduction ledger** = `driver_finance.driver_settlement_deductions` (cents). The live settlement-close route writes deductions here and stamps `applied_to_settlement_id`; the FIN-18 GL poster sums them into the settlement JE. The `settlement_lines` auto_deduction path and the `payroll.*` engine are retired.

**Net-pay floor** = **5% default, editable per settlement**. UI shows Accept / Edit-amount when applying deductions; terminal settlements may deduct up to the full final check.

**Recovery ordering** = **pay first, then escrow** for the shortfall. Escrow (a held-in-trust LIABILITY, QBO-1150040187) is the last-resort buffer and must keep growing to cover fines that arrive after separation. Migration 0094's walkoff trigger is reworked to pay-first, single-charge (no app-chargeback + escrow double-charge).

**Escrow return** = 60–90 days after separation, net of open claims; draws debit the Driver Escrow liability.

**Deduction authorization** = the signed **hire contract** (no separate driver e-sign); the `driver_deduction_auth` consent gate is satisfied by it. Hire-contract template later built in the Legal module for new drivers.

**Everything links to the load** — bills gain line items + `load_id`; diesel/expenses/repairs/maintenance/truck/trailer/driver all connect to the load. Never delete — archive only.

---

## CPA Answers Integration — Phase 1 (owner/CPA verified, 2026-07-18)

**Scope of this section:** governance / decision lock only. No executable GL math, no migration, no money-flag flip.
Companion surfaces: `docs/specs/TMS-QBO-PARALLEL-BOOKS.md`,
`docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` (same-dated section),
`.claude/skills/ih35-accounting-decisions/` (+ reference card),
`docs/trackers/FINANCIAL-OWNER-UNBLOCK-PACKET.md` (stale invoice-create line corrected).
Guard: `scripts/verify-cpa-answers-phase1-decisions.mjs` (Rule-17 auto-discovered verify-step).

### Revenue recognition + dual-basis crosswalk (LOCKED)
- **TMS ACCRUAL recognition event** = **canonical load delivery**.
- Operational definition (no guessing): **final active delivery stop completion / actual departure** is the
  source evidence. A load-level `delivered_at` may be used **only** when the implementation proves it is
  derived from that same event.
- Do **not** recognize at invoice creation.
- POD approval and invoice creation are **billing/factoring readiness** only.
- **Dual-basis crosswalk:** QBO **cash-basis** reporting/mirroring remains unchanged during the QBO-SoR window;
  delivery recognition does **not** redefine cash recognition.

### Factoring — Faro secured borrowing (sanitized terms)
- Treatment remains **secured borrowing / recourse** (not a sale); ASC 860 control-test nuance applies.
- Substance-over-form: even when a factoring contract is styled as a “sale,” GAAP treatment is secured borrowing
  with A/R retained and financing recognized as a liability — never as a sale of receivables.
- Sanitized commercial terms (actual factor statements remain authoritative when they differ):
  - Revolving limit **$1,000,000**
  - Tier 1 fee **1.5% of Net at funding**; Tier 2 fee **2% of Net at funding**
  - Reserve **1.5%**
  - **Purchase Price = Net − Fee − Reserve**
  - **Proceeds = Purchase Price − transaction/wire fees**
  - Term **30 days** + grace **5 days**
  - Repurchase deadline **95 days**
  - Default interest **0.067% per day, compounded daily, beginning after day 35**
  - **A/R remains on IH35 books as pledged collateral**; funding credits **Factoring Advance** —
    **no A/R derecognition**
- Decision docs must **not** include names, signatures, addresses, emails, personal-guaranty text, or
  executed-agreement text.

### Chart of Accounts structure (ADDITIVE ONLY)
Never delete or rename existing modules/accounts. Add missing structure:

**Sales of Service** children:
- Line Haul
- Fuel Surcharge
- Accessorial Revenue → Detention, Layover, Lumper, TONU, Other

**Interest & Financing Expense** children:
- Factoring Fees
- Factoring Default Interest
- Factoring Transaction/Wire Fees

**Also add:** Driver Damage Loss.

### Entity books + consolidated reporting
- Entities keep **separate entity books** with **reciprocal intercompany monitoring**.
- Retain existing **read-only consolidated reporting** additively for future reporting needs — do not remove
  it; do not treat consolidated output as a legal-entity book of record.

### Verified CoA export facts (owner-local verification snapshot)
These are governance facts from the owner-verified CoA export — **not** a live Neon row-count claim in this PR:

| Fact | Value |
|------|------:|
| Total rows | 1,368 |
| TRANSP | 387 |
| TRK | 947 |
| USMCA | 34 |
| QBO-connected | 1,294 |
| Active | 1,198 |
| Duplicate entity/account-number pairs | 0 |
| Opening balances in export | 0 |
