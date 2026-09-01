# CASCADE VOID — DESIGN (APPROVED WITH 4 CHANGES)

**Status:** **APPROVED WITH 4 CHANGES** · 2026-09-01 · Owner: “I follow Cursor recommendations if Cursor agrees with Claude.” Cursor **AGREES** with Claude Coder on all four changes (QBO / NetSuite / McLeod / Alvys + integrity bar below).  
**Build gate:** Cursor UI + CC-1 void-tree API may proceed against **this** file. No second graph.  
**Canonical law:** LINKAGE INTEGRITY LAW (data) + this UI contract · Claude-green standards on every money PR.

---

## 0. Why this exists

Owner tried to void a load and was refused because a linked bill was still live. The refusal was correct; the experience was wrong. Walking module-by-module discovering dependencies one error at a time is forbidden. Cascade Void is the UI expression of linkage integrity.

---

## APPROVED CHANGES (Claude · Cursor concurs · owner follows)

| # | Change | Why (standards) |
|---|--------|-----------------|
| **1** | **PAID invoice → §4 CANNOT** | Same class as paid-settlement clawback. QBO/NetSuite: paid A/R is not a silent void — needs refund / credit memo path. Voiding hides the cash obligation. |
| **2** | **Load→expenses MAY: pre-check SAMPLE ONLY** | Real fuel/cash left the bank. Cancelling a load does not erase the outflow. McLeod/ops + GAAP honesty: show real expenses unchecked; operator must deliberately check. |
| **3** | **ONE verb in UI: VOID** | Engine may reverse / cancel / status-close; owner always sees **Void**. Two verbs caused “no multi-select void” while Reverse/Cancel sat on screen. |
| **4** | **Tree shows MONEY** | Per-row amount + **TOTAL BEING REVERSED** above confirm. NetSuite/QBO-grade: the number that catches a wrong selection before commit. |

**Questions 3 & 5 (confirmed as written):** never-posted = delete/status-only, no fabricated JE. Void-reason catalog lands **before** the Cascade Void dialog ships (Cursor 1.6).

---

## 1. DEPENDENCY MAP (draft — CC-1 API must confirm)

For each **root** document type, linked children and void coupling:

| Root | Linked | MUST void together? | Notes |
|------|--------|---------------------|-------|
| **Load** | Proforma invoice | MUST if still proforma | Proforma converts in place at POD → once issued/sent, treat as **Invoice** rules |
| **Load** | Issued invoice | MUST (or refuse load void) | Cannot leave A/R open against a cancelled load |
| **Load** | Driver bill | MUST | Pay artifact for the load |
| **Load** | Settlement lines pointing at that bill | MUST release / reverse line | May force settlement reverse if only line |
| **Load** | Expenses with `load_id` | MAY | **Pre-check SAMPLE (`is_sample_data`) only.** Real expenses shown **unchecked**; require deliberate click (Change 2) |
| **Load** | Work orders / claims | MAY / advisory | Show; do not auto-void legal/insurance without explicit check |
| **Invoice** | Payment applications | MUST unapply / void applications | Then payment may remain with unapplied cash or void |
| **Invoice** | Factoring assignment | BLOCK until factoring released | Surface as CANNOT until factor path clears |
| **Invoice** | Source load | MAY cancel load | Only if no other live money hangs off load |
| **Bill** | Bill payments | MUST void payments first (FK order) | Already enforced today as refuse — tree makes it one click |
| **Bill** | Bank match on payment | MUST release match | Bidirectional — CC-1 `banking.matches` |
| **Bill payment** | Bank match | MUST release | Then revoke payment + reverse JE |
| **Payment (AR)** | Applications | MUST unapply | Then void payment + reverse JE |
| **Expense** | Bank match / JE | MUST | Never-posted → delete/status only, no fabricated JE (ACCT-F10217) |
| **Settlement** | Lines, deductions, escrow posts, bank pay | MUST reverse via existing reverse engine | **UI label: Void** (Change 3); engine action may remain `reverse` |
| **Settlement line** | Driver bill link | MUST | |
| **Driver bill** | Settlement line | MUST detach/reverse | |
| **Bank match** | Payment/bill payment/expense/JE | MUST unmatch both sides | |
| **JE** | Source document | Prefer void source, not orphan JE | Manual JE: void JE alone if no source |

### Proforma vs issued invoice

| State | On load cascade |
|-------|-----------------|
| Proforma (not converted) | Void/cancel proforma with load — number retired, no A/R impact (proforma stays out of A/R per lock) |
| Converted / issued invoice | Must void invoice (and applications) before or with load; dialog shows invoice as MUST |

---

## 2. THE DIALOG (what the owner sees)

1. **Entry:** **Void** from detail OR multi-select → **Void** (Change 3 — one verb everywhere)
2. **Header:** Root document label + id (e.g. `L-20260831-0004`)
3. **Tree (from CC-1 API):** nested rows — type · display id · EntityLink · state · MUST/MAY · CAN void? · block reason · **amount** (Change 4)
4. **Pre-check:** MUST rows pre-checked and locked; MAY sample/test pre-checked; **MAY real expenses unchecked** (Change 2)
5. **Cannot void rows:** shown in red section **before** confirm — deselect / fix path named
6. **Money footer:** **TOTAL BEING REVERSED** = sum of checked voidable money rows (Change 4) — above confirm
7. **Reason:** ONE catalog dropdown (`catalogs.void_reasons`) + optional memo (build blocked until catalog live)
8. **Confirm copy:** "Void N documents in one transaction. Each money document gets its own reversing JE."
9. **Result screen:** per-row succeeded / failed / skipped + reversing JE id link + bulk_call_id

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

API returns `can_void: false`, `block_reason`:

- Locked settlement without unlock
- Paid settlement (needs clawback path — not silent status flip)
- **Paid invoice** (needs refund / credit memo path — **Change 1**; same class as paid settlement)
- Factored invoice still assigned
- Bank line inside closed recon session
- Period-closed postings
- Missing void permission (Owner/Accountant only; others greyed + "request from Owner")

---

## 5. ONE MODEL — not two

| Layer | Owner |
|-------|--------|
| Dependency graph + can_void + amounts | **CC-1** `GET /api/v1/linkage/void-tree?type=&id=` (name TBD) |
| Dialog + multi-select entry points | **CURSOR** |
| Bidirectional bank match / void column unify | **CC-1** LINKAGE INTEGRITY LAW |

Cursor will **not** invent a second graph in the frontend.

---

## 6. RELATION TO WHAT ALREADY SHIPPED (honest)

| Capability | Live now? | Gap vs Cascade Void |
|------------|-----------|---------------------|
| Bulk void invoices/bills/expenses/payments | YES (accounting lists) | No dependency tree |
| Settlements multi-select (engine: reverse) | YES (#19042) | UI renamed to **Void** (Change 3); still no tree |
| Loads multi-select (engine: cancel) | YES (#19042) | UI renamed to **Void**; cancel refuses if deps — no tree |
| Bulk pre-validation | YES (#19038 factory) | Per-type, not cross-module tree |
| Hide voided / Hide cancelled | YES (#19052) | Done |
| Receive Payment top nav | YES (#19036) | Done |

---

## 7. OWNER RULINGS — CLOSED

1. ~~Approve MUST/MAY~~ → **APPROVED** with Changes 1–2.
2. ~~Reverse vs Void~~ → **ONE verb VOID** (Change 3).
3. Never-posted → delete/status-only — **CONFIRMED**.
4. MAY expenses pre-check → **SAMPLE ONLY** (Change 2).
5. Void-reason catalog before dialog — **CONFIRMED** (Cursor 1.6).
6. Tree amounts + total — **REQUIRED** (Change 4).

**Build order:** (a) UI verb rename Void live now · (b) CC-1 void-tree API with amounts + Change 1–2 rules · (c) Cursor Cascade Void dialog · (d) void-reason catalog before dialog ships.
