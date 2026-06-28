# Factoring Packet + AM/PM Purchases — Design (DESIGN-ONLY, Tier-1, PAUSE for Jorge)

**Status:** DESIGN-FIRST. No build, no migration, no GL-flag flip until Jorge approves.
**Date:** 2026-06-27 · **Lane:** factoring packet + posting (Claude Coder).
**Grounded on the LIVE surface** (read, not memory): `apps/backend/src/factoring/{batch,reserve,factor,packet-assemble,faro-csv-import}.service.ts` + `batch.routes.ts`, `apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx` + `apps/frontend/src/pages/factoring/{BatchWizard,ReserveTracker}.tsx`, `apps/backend/src/dispatch/factoring-queue.routes.ts` (#1500). **Builds on** `docs/accounting/FACTORING-ACCOUNTING-STRUCTURE.md` (the 5-step JE structure + roles) and `docs/specs/FACTORING-PACKET-AUTO-ASSEMBLY.md` — this doc does NOT redesign the accounting; it cites it and adds the packet/AM-PM/reserve pieces.

---

## 0 — How factoring actually works (researched; cite — McLeod / Alvys north-star)
Transportation invoice factoring (recourse, à la FARO → planned RTS):
- Carrier delivers a load, assembles a **schedule of accounts** (a batch of invoices) + the **NOA** (Notice of Assignment) the factor files against the debtor, and submits a **packet per invoice**: Invoice + signed **POD** + **Rate Confirmation** (+ **BOL** where applicable).
- Factor pays an **advance** (typically 80–97% of face) **same/next business day**, holds a **reserve** (holdback, ~3–20%), and charges a **factor fee** (discount, ~1–5%).
- When the debtor pays the factor, the factor **releases the reserve** (minus fees/chargebacks).
- **Recourse vs non-recourse:** recourse = carrier eats a **chargeback** if the debtor doesn't pay (FARO is recourse — see ACCOUNTING-STRUCTURE Step 5). Non-recourse shifts credit risk to the factor (RTS tiers vary).
- **McLeod/Alvys parity bar:** batch submission with auto-attached imaged docs (POD/RC/BOL), advance vs reserve vs fee broken out per invoice, a reserve ledger per debtor/batch, and reconciliation when the factor's remittance arrives. **North-star: match, then surpass** with per-entity GL posting + DIP-aware cash and a $0-drift reconcile.

---

## 1 — PACKET ASSEMBLY (fold in the deferred Edit-5 `packet-assemble.service.ts`)
**Current state (live):** `packet-assemble.service.ts` auto-fires on delivery + POD approval; it **stamps** `IH35_FACTORING_PACKAGE_V1::{meta}` into `load.notes`, emits `dispatch.factoring_packet_assembled`, and idempotently auto-creates the invoice. It does **NOT** yet bundle the actual documents. **Gap = the deferred Edit-5: produce the real document packet.**

**Design (behind the gate):**
- **Per selected invoice**, gather the imaged docs from R2 (`ih35-tms-evidence`): Invoice PDF (rendered from the invoice), the approved **POD** (`dispatch.pod_documents`), the **Rate Confirmation**, and **BOL** where present. Resolve each via the existing document/attachment tables (no new evidence store).
- **One packet per batch**: merge per-invoice docs into a single packet — **two outputs**: (a) **DOWNLOAD** = a zip (per-invoice subfolders) **and/or** a merged PDF; (b) **SEND** to the factor by the factor's configured channel (email to FARO submission inbox / portal upload). Reuse the existing notification/email infra; do **not** build a new mailer.
- **Idempotent + audit:** record `generated_at / approved_at / emailed_at / uploaded_at` (the `PacketMeta` already modeled in `packet-assemble.service.ts`) so a packet is assembled once and re-send is explicit. Every assemble/send is an audit event.
- **Completeness guard:** a packet is **not eligible to submit** unless POD is approved and Invoice + RC are present; missing-doc → block with a specific reason (mirrors the bank-feed "missing → block + direct to fix").

---

## 2 — ELIGIBLE-INVOICE SOURCE (why the picker is empty now)
**Current eligibility (live, `batch.service.ts`):** `accounting.invoices WHERE operating_company_id = $entity AND status = 'paid' AND COALESCE(factoring_status,'not_factored') = 'not_factored' AND NOT EXISTS (already in a factoring batch)`, then the customer must resolve to a factor (`factor_id`).
**Why the picker is empty NOW:** the invoice pipeline is **dormant** — prod has ~1 invoice total and **0** in a factorable state. Invoices appear in the picker only when **all** hold: (1) the invoice exists (a delivered+POD-approved load auto-creates it — §1), (2) it is **factor-eligible status**, (3) `factoring_status='not_factored'`, (4) it is not already in an open batch, and (5) its **customer is mapped to a factor-approved** relationship (`factor` credit source).
**⚠️ FLAG (surface, do not silently fix):** the live filter requires `status = 'paid'`. For advance factoring you submit invoices that are **issued/sent and NOT yet paid by the debtor** (the whole point is to get cash before the debtor pays). `status='paid'` would exclude exactly the invoices you factor. **Recommend** changing eligible status to issued/sent (e.g. `sent`/`open`, not `paid`) — but this is a **money-path correctness decision for Jorge**, not a silent edit. Confirm the intended invoice lifecycle states before build.

---

## 3 — AM / PM TWO PURCHASES (two batches per day)
Model **two batches/day per entity** keyed on submission window:
- **AM batch:** assembled + submitted **before noon** → factor funds the advance **before noon** (same-day morning wire to DIP).
- **PM batch:** submitted **by ~2 PM** → afternoon funding.
- Capture on the batch: `submission_window ∈ {AM, PM}`, `submitted_at` (actual timestamp), and **funding events** (`advance_expected_at`, `advance_funded_at`, `advance_amount_cents`). A batch is a first-class row (the existing `factoring batch` surface) extended with window + funding timestamps — **no new parallel store**.
- **Cutoff guard:** submitting an "AM" batch after the AM cutoff warns + offers PM (advisory; never blocks the money).
- The reserve tracker (§5) and the GL events (§4) key off the batch, so AM and PM each produce their own advance receipt + reserve-held rows.

---

## 4 — MONEY / GL (Tier-1; reuse the existing structure + ONE canonical resolver)
**Reuse `docs/accounting/FACTORING-ACCOUNTING-STRUCTURE.md` verbatim** — do not invent new JE math. Per-event balanced JEs (entity-scoped, DIP-aware), one canonical resolver **mirroring the bill-GL chain** (`bill-account-resolver` → `posting-engine.service.ts`), idempotent, **behind `GL_POSTING_ENABLED` (default OFF)**, maker-checker under Ch.11 DIP:

| Event | DR | CR | Roles |
|---|---|---|---|
| **Invoice factored** (batch submit) | Factoring Advances Receivable + Factoring Reserve Held + Factor Fee Expense | Accounts Receivable (face) | `factor_advances_receivable`, `factor_reserve_held`, `factor_fee_expense`, `ar_clearing` |
| **Advance funded** (wire to DIP) | Cash — DIP Operating (WF 6103) | Factoring Advances Receivable | `cash_dip`, `factor_advances_receivable` |
| **Reserve released** | Cash — DIP Operating | Factoring Reserve Held | `cash_dip`, `factor_reserve_held` |
| **Chargeback** (recourse) | Accounts Receivable | Factoring Chargebacks Payable → then Cr Cash on repay | `ar_clearing`, `factor_chargebacks_payable`, `cash_dip` |

- **Balance invariant:** at factor-submit, DR(advance+reserve+fee) = CR(AR face). Each event nets to zero by construction (trial balance stays 0).
- **Entity scope HARD** (post AF-1 per-entity COA): every account resolves within the batch's `operating_company_id`; cross-entity → 400, no JE. **One JE per event, idempotent** (a `matched_journal_entry_id`/source-key on the batch event — GUARD verifies present-vs-absent first, like Block A B-2).
- **Maker-checker (DIP):** Submit/post = Owner + Administrator; reverse = Owner only. **Flag stays OFF**; PAUSE for Jorge's written Tier-1 sign-off before any flip; GUARD verifies on a Neon branch (trial balance = 0) first.

---

## 5 — RESERVE TRACKER (held + released per batch)
- A **reserve ledger per factor / per batch / per entity**: `reserve_held_cents` at submit, `reserve_released_cents` on release, `reserve_outstanding = held − released − chargebacks`. Reuse the existing `reserve.service.ts` / `ReserveTracker.tsx` surface — extend, don't replace.
- Ties to GL: `factor_reserve_held` balance = Σ outstanding reserve per entity (a reconcile check, mirrors the recon-drift $0 rule).
- Surfaces: per-batch reserve line + a per-factor rollup (held / released / outstanding / aging), so the owner can see "what FARO still owes us."

---

## 6 — ONE-PAGE FLOW
```
 DELIVERY + POD approved
        │  (packet-assemble: stamp meta, emit event, auto-create invoice)
        ▼
 ELIGIBLE INVOICE  ── customer mapped to factor? ──► appears in Submit Batch picker
        │
   ┌────┴───────────────── AM BATCH (before noon) ─────────────────┐
   │  assemble packet (Invoice+POD+RC+BOL) → DOWNLOAD (zip/PDF)     │
   │  + SEND to factor (email/portal)                              │
   │        │ submit → JE: Dr AdvRecv+ReserveHeld+Fee / Cr AR      │  (GL flag OFF until sign-off)
   │        ▼                                                       │
   │  ADVANCE FUNDED (AM, wire to DIP) → JE: Dr Cash-DIP / Cr AdvRecv│
   └───────────────────────────────────────────────────────────────┘
   ┌────────────────────── PM BATCH (by ~2 PM) ───────────────────┐
   │  (same packet → send → submit → afternoon ADVANCE FUNDED)     │
   └───────────────────────────────────────────────────────────────┘
        │
        ▼
 DEBTOR PAYS FACTOR  →  RESERVE RELEASED → JE: Dr Cash-DIP / Cr ReserveHeld
        │  (or, recourse) CHARGEBACK → JE: Dr AR / Cr Chargebacks Payable
        ▼
 RESERVE TRACKER: held − released − chargebacks = outstanding (per batch/factor/entity)
```

---

## 7 — OPEN DECISIONS (PAUSE — Jorge answers before any build)
1. **Eligible invoice status** (§2): change from `status='paid'` to issued/sent? Confirm the exact factorable lifecycle states. (Money-path correctness.)
2. **Packet output**: zip, merged-PDF, or both for download? Send channel = FARO email inbox vs portal upload (and the RTS-future equivalent)?
3. **AM/PM cutoffs**: exact local-time cutoffs per factor; advisory-only vs hard?
4. **Recourse handling**: confirm FARO recourse + the chargeback workflow ownership (auto on factor remittance vs manual).
5. **GL go-live**: nothing posts until `GL_POSTING_ENABLED` flip — gated on all roles mapped per entity + a branch trial-balance-0 proof + your written Tier-1 sign-off.

**Build NOTHING until Jorge approves this design.** GUARD verifies the build on a Neon branch before any merge; no flag flip without written sign-off.
