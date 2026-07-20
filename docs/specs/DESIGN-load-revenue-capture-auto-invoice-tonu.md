# DESIGN — Load Revenue Capture: auto-invoice on delivery + TONU billable-cancellation AR

**Status:** DESIGN — owner + CPA approval required before any build. No code/migration in this doc.
**Author:** GUARD (Claude), 2026-07-20. **Class:** FINANCIAL-CLUSTER (§1.4) — owner-gated.
**Verified facts backing this design (live/repo, this session):**
- `dispatch.load_cancellations.charge_id` **does NOT exist on prod** (verified via Neon, discriminator-gated) → billable cancellations create no AR.
- No invoice call in the load delivered/completed state transitions (auditor-confirmed; dispatch→revenue bridge is manual).
- Existing infra to REUSE (no new GL math): `accounting/posting-engine.service.ts` (`postSourceTransaction`), the invoice tables, and the locked two-event revenue latch.

---

## 1. The problem (why this is a money leak)
1. **A delivered load does not automatically become a customer invoice.** Someone must remember to invoice → missed/late billing, AR understated, cash delayed.
2. **A billable cancellation (TONU — Truck Ordered, Not Used) produces no charge.** The load is cancelled with a fee owed, but there is no `charge_id`/invoice link, so the customer is never billed for the TONU fee.

Both are **direct revenue capture failures** — exactly what a CPA/auditor/lender review would flag.

## 2. How the systems we target do it (standard to match/surpass)
- **McLeod / Alvys:** the customer invoice is generated **off the load lifecycle** — at delivery / POD-received, not by hand. TONU is a first-class **billable cancellation reason** that bills a preset fee.
- **QuickBooks / NetSuite:** invoice → A/R with revenue recognition; NetSuite uses a contract-asset (unbilled) position between earning and billing.
- **Our locked policy (owner 2026-07-18 + two-event latch):** revenue recognized **at delivery**; two-event latch (DR Unbilled/Contract-Asset → CR Line-Haul Income at delivery; reclass to A/R at invoice/POD). ASC 606 point-in-time at-delivery is the accepted simplification for short cross-border transit.

## 3. Design

### 3a. Auto-invoice on delivery (event-driven, reuse poster)
- **Trigger:** load state transition → `delivered` (POD/`completed_docs_received`), emitted through the existing load state machine (no new lifecycle).
- **Action:** create the customer invoice from the load (customer, line-haul rate = `rate_total_cents` GROSS, accessorials, fuel surcharge) via the existing invoice-create path, then post via `postSourceTransaction` — **reuse the poster, write NO new GL math.**
- **JE (locked two-event latch):** Event 1 @ delivery: DR Unbilled/Contract-Asset, CR Line-Haul Income. Event 2 @ invoice/POD: DR A/R, CR Unbilled. (Single-obligation freight → simple per-event JE is correct + auditable.)
- **Idempotency:** deterministic key `load:{loadId}:invoice` + unique index → a load can never double-invoice (same discipline as insurance `ins:{policyId}:{seq}`).

### 3b. TONU billable-cancellation → AR
- **Schema (owner Neon ceremony):** add `dispatch.load_cancellations.charge_id UUID` FK → the created AR charge/invoice. Additive, `IF NOT EXISTS`, void-not-delete preserved. Migration number strictly above main's max, re-checked at push.
- **Action:** on a cancellation whose reason is billable (TONU), create an AR charge/invoice for the TONU fee (from the customer's rate/TONU schedule) and set `charge_id`. Reuse the same invoice-create + poster path as 3a.
- **Governance:** billable-vs-non-billable is driven by the cancellation-reason catalog (owner-configurable), not hardcoded.

### 3c. Prerequisites (all owner/CPA-gated, from the locked rev-rec design)
1. **Seed the Unbilled Revenue / Contract-Asset account** (TRANSP + USMCA; TRK excluded) — does not exist yet; owner-Neon migration.
2. **CPA sign-off** on at-delivery point-in-time policy + materiality memo + contract-asset classification (per locked rev-rec doc).
3. **Flag wiring:** the revenue-post flag must be per-entity (register in `POSTING_FLAG_KEYS`, pass opco) — currently global-only; fix before enabling. Default OFF.
4. Reconcile with the existing **deferral** rev-rec module (do NOT double-post): use the generic poster, not the deferral path (§9 drift noted in locked rev-rec memory).

## 4. Regression guards (§2)
- Guard: an invoice row exists for every `delivered` load (no silent skip).
- Guard: every billable cancellation has a non-null `charge_id`.
- Guard: revenue posting is balanced (DR=CR) and idempotent.

## 5. What I need from the owner (the gated decisions)
| # | Decision | Recommendation |
|---|---|---|
| 1 | Approve auto-invoice-on-delivery + TONU-AR build | **GO** — highest-value revenue capture; matches McLeod/Alvys + locked policy |
| 2 | `load_cancellations.charge_id` migration (owner Neon apply) | Approve SQL when drafted |
| 3 | Seed Unbilled/Contract-Asset account (TRANSP+USMCA) | Approve migration when drafted |
| 4 | CPA sign-off (materiality memo + contract-asset class) | Owner + Martin |
| 5 | Flag enablement per entity after CPA + Neon tie-out | Keep OFF until tie-out |

**Nothing is built until #1 is approved.** On GO, I draft the migration SQL + the poster wiring (reusing existing infra), show you `git diff --staged` + full SQL, and you apply/flip — I never self-merge financial.
