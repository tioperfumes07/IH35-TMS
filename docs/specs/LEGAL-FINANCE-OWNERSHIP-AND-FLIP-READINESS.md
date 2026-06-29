# Legal ↔ Finance Ownership Boundary & Flip-Readiness Gate (LOCKED — Option B)

**Status:** LOCKED decision, 2026-06-29 (Jorge + GUARD). This document is the canonical
source of truth for *where lease/deduction money-math lives*. It **supersedes** the literal
Phase 5 wording in the legal block spec
(`CODER-BLOCK_Legal-Template-Library.md`), which says "Legal builds the ASC 842 +
deduction engines." **It does not.** Build to this document.

> Why this exists in the repo and not just in chat: on this project, agreements that live only
> in a chat thread evaporate between agents (the recurring entity-independence drift is the
> documented example). The separation-of-duties rule below MUST be discoverable by a future
> agent reading the spec tree, so it can't read the stale Phase 5 and rebuild the engine in
> Legal. — GUARD condition #1.

---

## 1. The rule — separation of duties (Option B)

The module that **captures consent** must never be the module that **posts the money**. This is
how NetSuite (lease record vs. Fixed-Assets subledger), McLeod (signed deduction auth as driver-
file evidence vs. settlement engine), and QuickBooks (source doc references postings; it does not
duplicate them) are all built. One source of truth per number; one place to audit; real
separation of duties.

### Legal module OWNS (and only these):
- The contract **template** library + lifecycle (draft → pending_review → approved → active →
  retired), attorney-review gate.
- The executed **instance** (`legal.contract_instances`) + the signed PDF
  (`signed_pdf_attachment_id`).
- The **e-signature** capture (`legal.signatures`, multi-party + witness) and signing tokens.
- The **consent record** — i.e. the fact that a driver_deduction_auth / lease was signed, by whom,
  when, with what filled variables.
- The immutable **audit trail** (`legal.contract_audit_log`).
- The **link + handoff**: `legal.contract_instance_links` rows (`link_type` ∈ driver, employee,
  customer, unit, matter, deduction_schedule, fixed_asset, dq_file) and an emitted event so the
  owning Finance subledger can pick the signed document up.
- The **consent gate**: an exposed, app-enforced check that answers "is there a signed
  authorization of type X on file for entity Y?" — so Finance can *require* it before posting.

### Finance / Accounting modules OWN (Legal must NOT build these):
- **FIN-22 (lease subledger):** ASC 842 classification (Option A FMV → operating; Option B fixed
  payoff → sales-type / financed), the ROU-asset / lease-liability (or lease-receivable) schedule,
  and **every GL/JE posting** for leases. Behind `LEASE_GL_POSTING_ENABLED` (default OFF).
- **FIN-18 (settlement / deduction posting):** the deduction math and **every GL posting** that
  reduces a driver settlement. It must call the Legal **consent gate** ("signed auth on file?")
  before posting (FLSA). Behind `SETTLEMENT_GL_POSTING_ENABLED` (FIN-18, default OFF).

### Net effect on the legal block's Phase 5
Phase 5 in the legal build is **trimmed to link-and-consent-only**:
1. On a signed `driver_deduction_auth*` instance → write a `contract_instance_links` row
   (`link_type='deduction_schedule'`) + emit the handoff; expose the "deduction needs signed auth"
   gate. **No deduction math, no GL.**
2. On a signed `lease_v1..v4` / `lease_v2_comprehensive` instance → write
   `contract_instance_links` rows (`link_type='fixed_asset'` per Exhibit-A unit) + emit the
   handoff. **No ASC 842 classifier, no lease schedule, no GL.**

The classification helper, the schedule, and all posting are **reserved for FIN-22 / FIN-18** and
are not in the legal block.

---

## 2. Flip-readiness gate (GUARD condition #2 — in writing)

**No lease or deduction posting flag (`LEASE_GL_POSTING_ENABLED`, `SETTLEMENT_GL_POSTING_ENABLED`) ever
flips ON until the owning Finance engine is:**
1. **Built** — FIN-22 (lease) / FIN-18 (deduction→GL) committed and merged.
2. **Unit-tested** on a Neon branch (balanced JE asserted; ASC 842 classification correct per
   election; deduction math correct; deduction post refuses to run without a signed-auth link).
3. **CPA-confirmed** — lease characterization (operating vs. sales-type) and cash-vs-accrual
   treatment signed off per deal.
4. **Neon-branch verified** — a real end-to-end post on a prod-copy branch, balanced, before the
   flag is flipped in prod.

Flipping either flag is a **Tier-1 ceremony** (CLAUDE.md §1.4), never self-merged.

### No live-money hole in the meantime
Because both flags stay OFF until the above, the only thing the Legal-first sequence can do before
the Finance engine exists is **sign a lease/auth and store it** — which is correct and carries zero
financial posting. The engine is **not orphaned**: FIN-18 and FIN-22 are committed as **required,
not optional** dependencies of ever flipping the flags. The linkage (`contract_instance_links`) and
the consent gate ship now in Legal; the math lands later in Finance.

---

## 3. Dependency, stated

```
Legal block (this build, [HOLD-FOR-JORGE])
  ├─ ships: templates + lifecycle + creator + e-sign + operational links
  ├─ ships: contract_instance_links (fixed_asset / deduction_schedule) + handoff event
  ├─ ships: consent gate ("signed auth on file?")
  └─ does NOT ship: ASC 842 engine, lease schedule, deduction math, any GL posting

FIN-22 (lease subledger)  ── REQUIRED before LEASE_GL_POSTING_ENABLED may flip
FIN-18 (settlement/deduction posting) ── REQUIRED before SETTLEMENT_GL_POSTING_ENABLED may flip
  └─ both consume the Legal link + consent gate; both own their own GL; both Tier-1 to flip
```

Related: `docs/lockdown/00_LOCKED_DECISIONS.md`, `CLAUDE.md §1.4` (financial cluster),
the cross-module-linkage rule (every link built, none orphaned), and
`CODER-BLOCK_Legal-Template-Library.md` (the legal build — Phase 5 read as trimmed per §1 above).
