# CASCADE VOID — DESIGN FOR OWNER REVIEW (no code until approved)

**Status:** DESIGN ONLY · Cursor will not implement until Jorge rules on this file.  
**Date:** 2026-09-01 · Seat: CURSOR · Companion: CC-1 owns the dependency-tree API (same model — one truth).  
**Canonical law:** LINKAGE INTEGRITY LAW (data) + this UI contract.

---

## 0. Why this exists

Owner tried to void a load and was refused because a linked bill was still live. The refusal was correct; the experience was wrong. Walking module-by-module discovering dependencies one error at a time is forbidden. Cascade Void is the UI expression of linkage integrity.

---

## 1. DEPENDENCY MAP (draft — CC-1 API must confirm)

For each **root** document type, linked children and void coupling:

| Root | Linked | MUST void together? | Notes |
|------|--------|---------------------|-------|
| **Load** | Proforma invoice | MUST if still proforma | Proforma converts in place at POD → once issued/sent, treat as **Invoice** rules |
| **Load** | Issued invoice | MUST (or refuse load void) | Cannot leave A/R open against a cancelled load |
| **Load** | Driver bill | MUST | Pay artifact for the load |
| **Load** | Settlement lines pointing at that bill | MUST release / reverse line | May force settlement reverse if only line |
| **Load** | Expenses with `load_id` | MAY | Operator chooses; default pre-checked for sample/test |
| **Load** | Work orders / claims | MAY / advisory | Show; do not auto-void legal/insurance without explicit check |
| **Invoice** | Payment applications | MUST unapply / void applications | Then payment may remain with unapplied cash or void |
| **Invoice** | Factoring assignment | BLOCK until factoring released | Surface as CANNOT until factor path clears |
| **Invoice** | Source load | MAY cancel load | Only if no other live money hangs off load |
| **Bill** | Bill payments | MUST void payments first (FK order) | Already enforced today as refuse — tree makes it one click |
| **Bill** | Bank match on payment | MUST release match | Bidirectional — CC-1 `banking.matches` |
| **Bill payment** | Bank match | MUST release | Then revoke payment + reverse JE |
| **Payment (AR)** | Applications | MUST unapply | Then void payment + reverse JE |
| **Expense** | Bank match / JE | MUST | Never-posted → delete/status only, no fabricated JE (ACCT-F10217) |
| **Settlement** | Lines, deductions, escrow posts, bank pay | MUST reverse via existing reverse engine | Label in UI: **Reverse** (settlements) not Void — same cascade dialog |
| **Settlement line** | Driver bill link | MUST | |
| **Driver bill** | Settlement line | MUST detach/reverse | |
| **Bank match** | Payment/bill payment/expense/JE | MUST unmatch both sides | |
| **JE** | Source document | Prefer void source, not orphan JE | Manual JE: void JE alone if no source |

### Proforma vs issued invoice (item 5 of owner ask)

| State | On load cascade |
|-------|-----------------|
| Proforma (not converted) | Void/cancel proforma with load — number retired, no A/R impact (proforma stays out of A/R per lock) |
| Converted / issued invoice | Must void invoice (and applications) before or with load; dialog shows invoice as MUST |

---

## 2. THE DIALOG (what the owner sees)

1. **Entry:** Void / Cancel / Reverse from detail OR multi-select → "Cascade void…"
2. **Header:** Root document label + id (e.g. `L-20260831-0004`)
3. **Tree (from CC-1 API):** nested rows — type · display id · EntityLink · state · MUST/MAY · CAN void? · block reason
4. **Pre-check:** MUST rows pre-checked and locked; MAY rows checked by default for `is_sample_data` / owner can uncheck
5. **Cannot void rows:** shown in red section **before** confirm — deselect / fix path named (same class as bulk pre-validation)
6. **Reason:** ONE catalog dropdown (`catalogs.void_reasons`) + optional memo (VOID-REASON-CATALOG-01 — if catalog not live yet, design assumes it; build blocked on catalog)
7. **Confirm copy:** "Void N documents in one transaction. Each money document gets its own reversing JE."
8. **Result screen:** per-row succeeded / failed / skipped + reversing JE id link + bulk_call_id

---

## 3. EXECUTION ORDER (one atomic DB transaction)

Fail-stop. Pre-validate entire selection first (no partial apply).

```
1. Release bank matches (both sides)
2. Unapply / void bill payments & customer payment applications
3. Void/reverse expenses (never-posted = status-only, no fake JE)
4. Void bills / invoices (each → own reversing JE when posted)
5. Reverse settlement lines → reverse/cancel settlement if required
6. Void/cancel driver bills as required
7. Cancel / void load (real cancelLoad service — never bare set_status)
8. Audit event per document + one batch audit parent
```

On failure: full rollback; result screen shows the blocking row and reason (never "0 of 11" without the list).

---

## 4. WHAT CANNOT BE VOIDED (surfaced BEFORE commit)

Examples (API returns `can_void: false`, `block_reason`):

- Locked settlement without unlock
- Paid settlement (needs clawback path — not silent status flip)
- Factored invoice still assigned
- Bank line inside closed recon session
- Period-closed postings
- Missing void permission (Owner/Accountant only; others greyed + "request from Owner")

---

## 5. ONE MODEL — not two

| Layer | Owner |
|-------|--------|
| Dependency graph + can_void | **CC-1** `GET /api/v1/linkage/void-tree?type=&id=` (name TBD) |
| Dialog + multi-select entry points | **CURSOR** |
| Bidirectional bank match / void column unify | **CC-1** LINKAGE INTEGRITY LAW |

Cursor will **not** invent a second graph in the frontend.

---

## 6. RELATION TO WHAT ALREADY SHIPPED (honest)

| Capability | Live now? | Gap vs Cascade Void |
|------------|-----------|---------------------|
| Bulk void invoices/bills/expenses/payments | YES (accounting lists) | No dependency tree |
| Settlements multi-select **Reverse** | YES (#19042) | Label is Reverse; no tree |
| Loads multi-select **Cancel** | YES (#19042) | Cancel service only; refuses if deps — no tree |
| Bulk pre-validation | YES (#19038 factory) | Per-type, not cross-module tree |
| Hide voided / Hide cancelled | YES (#19052) | Done |
| Receive Payment top nav | YES (#19036) | Done |

**Owner report "still no multi-select void" on settlements/loads:** the actions exist as **Reverse** / **Cancel loads**, not a button labeled Void. Cascade Void unifies naming + tree. Until design approved, hard-refresh live `8112092` and use those batch actions for Phase 2 clearing.

---

## 7. OWNER RULINGS NEEDED (before code)

1. Approve dependency MUST/MAY table above (or mark changes).
2. Confirm settlements keep verb **Reverse** inside cascade UI, or rename to Void everywhere.
3. Confirm never-posted docs: delete/status-only (already CC-1 law) inside cascade.
4. Confirm MAY expenses default: pre-check sample only vs pre-check all load expenses.
5. Void-reason catalog must land before dialog ships (Cursor 1.6 / CC-1 migration band).

**Reply with APPROVED / CHANGES — then Cursor builds against CC-1 tree API.**
