# Load Book — Create Persistence Gap · DESIGN PROPOSAL (Tier-1)

**Date:** 2026-06-24 · **Status:** `[HOLD-FOR-JORGE — TIER 1]` · **Design-only — NO code, NO migration built until Jorge reviews + approves.**
Source: Pass-1 design-parity recon + a dedicated read-only persistence trace (form → payload → backend INSERT/UPDATE into `mdata.loads`), GUARD-confirmed.

---

## 1. Problem (confirmed)

The Book Load wizard (`BookLoadModalV4`) renders fields the user fills in, but several are **never persisted on create**. Most fields DO persist (INSERT + a post-insert UPDATE handles pieces, PO, reefer temp, trip_type, stops, detention/chargeback/late-delivery, miles). The dropped ones fall into three tiers:

| Field | Where it lives today | Persisted? | Money? |
|---|---|---|---|
| **`cash_advance_cents`** | `BookLoadModalV4` form + a smoke test ONLY | **NO** — not in payload type, no column, no backend | **YES** |
| **`fuel_advance_cents`** | same — form + smoke test only | **NO** | **YES** |
| `driver_pay_rate_per_mile` | sent in payload, **backend ignores it** | NO | indirectly (settlement) |
| `commodity` | payload → a metadata JSON blob (not a queryable column) | PARTIAL | no |
| `weight_lbs`, `trailer_type` | form/payload, not in INSERT | NO | no |
| 5 equipment toggles (reefer-fuel / pulp-probe / locking-jacks / load-locks / straps) | form only, no columns | NO | no |

**Priority = the two advances.** GUARD independently confirmed `cash_advance_cents` + `fuel_advance_cents` exist ONLY in `BookLoadModalV4` + a smoke test — **zero backend/migration footprint.** A dispatcher can enter a driver advance at booking and it silently vanishes. That is real money loss.

---

## 2. Key insight — the advance→settlement infra ALREADY EXISTS (reuse, don't bolt columns on the load)

`mdata.loads` has **no** advance column, but driver-finance already has the full machinery:

- **`driver_finance.cash_advance_requests`** (migration ~0138+ area) — lifecycle `pending → under_review → approved → denied/expired/cancelled`, with audit (`cash_advance_request_audit`), outbox events, and owner-approval (`cash-advance-owner-approval.service.ts`). Fields: `driver_id`, `requested_amount_cents`, `proposed_recovery_per_settlement_cents`, `linked_advance_id`.
- **`driver_finance.driver_advances`** (migration `0138`) — the disbursed-advance record: `driver_id`, `amount`, `disbursement_status`, `status` (default `outstanding`). This is what `linked_advance_id` points at; approval creates it.
- **`driver_finance.settlement_lines`** — `line_type` CHECK already includes **`'deduction'`** (alongside earnings / extra_pay / reimbursement / abandonment_chargeback / team splits). An advance is recovered from a settlement as a `deduction` line — **the GL/settlement math already exists; we write NO new posting logic** (per the reuse-existing-infra rule).

**Implication:** the correct fix is **not** "add `cash_advance_cents`/`fuel_advance_cents` columns to `mdata.loads`." Raw columns would record an intent that never moves money — the advance still wouldn't reach the driver or be recovered at settlement. The booked advance must flow into the **existing** advance → `driver_advances` → settlement-`deduction` path.

---

## 3. Proposal for the advances (the part that matters) — for Jorge's decision

**Recommended shape (reuse infra):** at book time, a non-zero cash/fuel advance creates a driver-finance **advance record** (the existing `cash_advance_requests`/`driver_advances` path), tied to the load + driver, which is then recovered from the driver's settlement as a `deduction` line — the same as a driver-initiated advance, just dispatcher-initiated at booking.

This needs Jorge to decide **four** things (none built until decided):

1. **Load ↔ advance link.** Neither `cash_advance_requests` nor `driver_advances` currently carries a `load_id`. Options: (a) add `load_id` (nullable FK) to the advance record [recommended — keeps the load as the origin of truth, no new column on `mdata.loads`], or (b) add `cash_advance_cents`/`fuel_advance_cents` + `advance_id` to `mdata.loads` as a booking record that *enqueues* the advance. (a) reuses infra most cleanly.
2. **Cash vs fuel advance — same system or two?** A "fuel advance" may belong to the **fuel-card / Corpay** path, not driver cash advances. If fuel advances are fuel-card draws (not recovered from settlement the same way), they need a different target than cash advances. **Need confirmation before either is wired.**
3. **Approval semantics.** Driver-initiated advances go through owner-approval. A **dispatcher-booked** advance at load creation — is it auto-approved (booking carries the authority), or does it still raise an owner-approval request? (Money-movement gate — §1.6: owner-entered / owner-approved money only.)
4. **Recovery default.** `proposed_recovery_per_settlement_cents` — does a booked advance recover in full at the next settlement, or amortize? Default OFF / explicit per advance.

**Tier-1 ceremony:** once Jorge picks the shape, I produce the migration SQL + the wiring **as a reviewable diff with the full SQL shown**, run it locally, and **WAIT for explicit "OK to merge"** — never self-merge (§1.4/§2). Posting reuses the existing `deduction` line; I write no new GL math.

---

## 4. `driver_pay_rate_per_mile` — resolve the by-design QUESTION first (do NOT add a column yet)

The wizard sends a load-specific pay rate; the backend **ignores it** on insert. Before proposing any persistence:

- **Open question:** does the settlement engine compute driver pay from a **load-specific rate** or the **driver's profile rate**? (A quick scan of `settlement-engine.ts` / `settlements-load-bookended.service.ts` did **not** surface a load-rate read — suggesting profile-rate is the current source.)
- If profile-rate is **intentional**, adding `mdata.loads.driver_pay_rate_per_mile` creates a **second source of truth** for driver comp — **worse than the current gap** (silent disagreement between load rate and profile rate at settlement).
- **Action:** trace the settlement pay-rate source and decide intent **before** any column. If load-specific override is genuinely wanted, design it as an explicit override with a documented precedence rule. **No column proposed here.**

---

## 5. Lower-priority (no money impact) — defer or batch later

- **`commodity`** — currently stored only in a metadata JSON blob; not queryable. Add a real column if reporting needs it.
- **`weight_lbs`**, **`trailer_type`** — straightforward nullable columns if wanted (trailer_type may already be implied by `assigned_trailer_unit_id`).
- **5 equipment toggles** (reefer-fuel / pulp-probe / locking-jacks / load-locks / straps) — no columns exist; only worth adding if equipment-matching/dispatch logic will consume them. Otherwise they're UI-only and should arguably be **removed from the form** rather than persisted (don't render a control that does nothing).

All of §5 is non-financial and can be a separate, lower-priority migration after the advances are settled.

---

## 6. What does NOT get built without Tier-1 sign-off
- No `mdata.loads` schema change, no advance wiring, no settlement posting.
- Money-movement (advances) = owner-entered/owner-approved per §1.6; default any new flag **OFF**.
- The advance recovery **reuses** the existing `settlement_lines` `deduction` path — no new GL/ledger math.

**Decision requested:** §3 (advance shape + the 4 sub-questions) and §4 (pay-rate intent). On your answers I produce the migration + wiring as a show-first, WAIT-for-OK Tier-1 diff.
