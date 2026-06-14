# RELAY — Internal-Bank + Diesel-Code — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting, no money path). Build is a **FINANCE block** — designed WITH Jorge, gated behind a flag default OFF, GUARD verifies every money-path diff before merge, never auto-fired, never self-merged.
**Audience:** Jorge + GUARD + accountant.
**Date:** 2026-06-14
**Grounds:** Jorge's exact Relay workflow (captured below) + the locked two-date / bank-matching principle (expense posts on the transaction date; reconciliation happens in Banking) + the existing catalogs/accounts + audit-spine infra. All amounts integer cents.

---

## 0. Executive summary

Relay is a **pre-funded internal bank account** (a fuel/expense wallet) in the books — **no credit, fully pre-paid**. Jorge funds it Wells Fargo → Relay; drivers draw against the balance via **diesel codes** to pay for diesel, tolls, scales, and other expenses. Every withdrawal posts as a **debit (expense) on the day it was generated**; every WF→Relay transfer posts as a **credit (deposit)**. The whole feed is uploaded and **matched** — standard bank reconciliation, the same two-date model already used for banking.

The software side is a **diesel-code request flow**: driver requests → routes to dispatcher in the Driver Hub → on approval the **code is delivered to the driver** AND an **expense is auto-created** (transaction-dated, categorized as a Relay withdrawal, carrying load/driver/(reefer-hours)/**STATE+LOCATION** context), ready to match against the uploaded Relay feed.

Two phases, identical data — only the **code source** changes:
- **Phase 1 (build first):** dispatcher TYPES the Relay code into the approval (editable); driver receives it in the app.
- **Phase 2 (later; Jorge has the Relay API):** approval calls Relay's API to **auto-issue** the code (dispatcher can still edit/override). Needs the load ASSIGNED, and reefer-hours if REEFER.

**Shared-field note (build once):** the fuel **STATE + LOCATION** captured at diesel-code approval is the SAME field IFTA needs — see `MILEAGE-MODEL-DESIGN.md` §6 / `03-MILEAGE-LIFECYCLE-LOCKED.md`. Capture it here once and both Relay-recon and IFTA-by-state consume it.

---

## 1. Account model — Relay as an internal bank account

**Workflow (Jorge's exact cycle):**
1. Jorge transfers money **Wells Fargo → Relay** (a bank transfer; posts as a **credit/deposit** into the Relay account).
2. Relay charges a **fee** (an expense).
3. Drivers draw against the Relay balance via **diesel codes** (diesel, tolls, scales, other).
4. **Every withdrawal** posts as a **debit** in the Relay account, created as an **expense ON THE DAY IT WAS GENERATED**.
5. All Relay transactions are uploaded (withdrawals = debits, WF→Relay = credits) and **matched** — standard bank reconciliation.

**Representation in `catalogs.accounts`:**
- Relay is modeled as a **bank/cash-equivalent account** (asset) — it holds pre-funded company money, so it behaves like a checking sub-account, not a vendor liability. There is **no credit/AP** because it is pre-paid.
- ⚠️ **Open item (1a):** Jorge notes Relay "may currently be categorized as a bank account, maybe improperly." **Recommended treatment:** a dedicated **bank-type account** (e.g. "Relay Fuel Wallet") under cash/banking, so it appears in bank reconciliation alongside WF. Do NOT change the existing account's type without Jorge's explicit OK — recommend, confirm in session, then migrate with an audited change.
- **WF→Relay transfer:** a **bank transfer** (Dr Relay Fuel Wallet / Cr Wells Fargo) — moves cash between two asset accounts, not income/expense. Posts on the transfer date; reconciles in Banking when the Relay feed shows the matching credit.
- **Relay fee:** an **expense** (Dr Fuel-service fee expense / Cr Relay Fuel Wallet). **Open item (1b):** cadence — per-transfer vs monthly statement fee? Posts on the fee's transaction date.

---

## 2. Diesel-code data model (request → approval → auto-expense → match)

The flow that feeds the Relay account:

1. **Request** — driver requests a diesel code from the app (amount/purpose; for Phase 2, the current assigned load + reefer-hours if reefer).
2. **Route** — appears for the **dispatcher in the Driver Hub** (mirror the existing cash-advance / driver-request approval cascade).
3. **Approval** — two things happen atomically:
   - **(a) Code delivered to driver:**
     - Phase 1: dispatcher **types** the Relay code (editable field); driver sees it in the app.
     - Phase 2: system calls **Relay API** to auto-issue; dispatcher can still **edit/override**.
     - A code `source` field **MANUAL | RELAY_API** records provenance (same phasing pattern as PC*Miler MANUAL|PCMILER and Samsara mileage source).
   - **(b) Expense auto-created** — dated the **day generated**, categorized as a **Relay withdrawal (debit)**, carrying **load / driver / (reefer-hours) / STATE + LOCATION** context, in **pending-match** state, ready to reconcile against the uploaded Relay feed.

**Data shape (additions — each gets `is_active` + audit columns per standing rule; finalize in session):**
- **`diesel_code_requests`** (or reuse the existing driver-request table with a `request_type='diesel_code'`): driver, requested amount/purpose, status (requested/approved/rejected), approver, current assigned load (Phase 2), reefer-hours (Phase 2), the **code value**, code **`source` (MANUAL|RELAY_API)**, **STATE + LOCATION**, timestamps.
- The auto-created **expense** links back to the request (`source_diesel_code_request_id`) and to the **Relay account**, with `match_status` (pending/matched/exception).
- **Editable but audited:** the code field is editable (Phase 1 typed, Phase 2 override) — **every edit writes an audit-spine row** (admin/owner), per the locked editable-but-audited principle.

---

## 3. Expense categorization (the Relay category map)

Relay-paid withdrawals categorize into an **editable expense-category map** (CRUD in software, like the catalogs):
- **Diesel** (fuel expense — also feeds fuel-by-state / IFTA).
- **Tolls.**
- **Scales** (weigh stations).
- **Other Relay-paid expenses** (catch-all; specific categories added in software).

Each category maps to a GL expense account. **Open item (3a):** which categories beyond diesel/tolls/scales does Jorge want seeded.

---

## 4. Reconciliation (mirror the existing bank-recon / two-date model)

- **Upload** the Relay transaction feed: **debits = withdrawals** (diesel-code payments, tolls, scales), **credits = WF→Relay transfers**.
- **Match** each uploaded line to the software record: withdrawals → the auto-created expenses (by code / amount / date / driver); credits → the WF→Relay bank transfer.
- **Two-date principle (locked):** the **expense posts on the transaction date** (day generated); **reconciliation happens in Banking** when the uploaded line matches — never re-date the expense to the statement date.
- **Exceptions:** unmatched uploads (a Relay charge with no software request) and unmatched expenses (a code issued but not yet on the feed) surface in a recon exception queue for review — mirror the existing bank-recon unmatched handling.
- **Open item (4a):** does the Relay transaction upload already have a fixed CSV/format? (drives the importer mapping.)

---

## 5. Phasing (Phase 1 manual · Phase 2 Relay API)

| | Phase 1 (build first) | Phase 2 (later — Jorge has the API) |
|---|---|---|
| Code origin | dispatcher **types** it | **Relay API auto-issues** on approval |
| Editable | yes | yes (dispatcher override) |
| `source` value | `MANUAL` | `RELAY_API` |
| Prereqs | none beyond approval | load **assigned**; reefer-hours if **reefer** (pulled from driver's current assigned load) |
| Everything else | identical | identical |

Only the **code source changes** between phases — same request, same auto-expense, same categorization, same reconciliation. This mirrors the PC*Miler / Samsara phasing (manual now, API later, `source` field records which).

---

## 6. Audit

Per the audit-spine standing rule, log:
- **Every code issuance** (who approved, when, amount, load/driver, source MANUAL|RELAY_API).
- **Every auto-created expense** (transaction-dated, category, Relay-account debit).
- **Every edit** to a code or expense (old → new, actor, reason) — admin/owner.
- **Every WF→Relay transfer and Relay fee** posting.
- **Every reconciliation match / exception resolution.**

VOID ≠ DELETE applies: a posted Relay expense is **voided** (reversing entry, record kept + audit), never deleted — consistent with `01-PERMISSIONS-LOCKED.md` and every accounting screen.

---

## 7. What already exists (build on this — do NOT duplicate)

| Asset | Use in Relay block |
|---|---|
| `catalogs.accounts` + account-type model | the Relay bank/cash account + the expense-category GL accounts |
| Driver-request / cash-advance approval cascade (Driver Hub) | the diesel-code request → dispatcher-approval flow (add a request type) |
| Existing bank-reconciliation / two-date model | the Relay feed upload + match (don't reinvent recon) |
| Audit spine | code/expense/edit/transfer/fee logging |
| Fuel-by-state STATE+LOCATION field (mileage/IFTA) | **shared** — capture at diesel-code approval, IFTA consumes it (build once) |
| `source` phasing pattern (PC*Miler/Samsara) | the code `source` MANUAL\|RELAY_API field |

**Implication:** the Relay block is mostly **a request type + an auto-expense rule + a category map + a recon importer** over existing accounts/approval/recon/audit primitives — plus the Phase-2 API call.

---

## 8. Open questions for Jorge

- **(1a)** Confirm Relay account **type/treatment** — recommended: dedicated bank-type "Relay Fuel Wallet" under cash/banking. Re-categorize the existing account (audited) or leave as-is?
- **(1b)** Relay **fee posting cadence** — per-transfer, or monthly statement fee?
- **(3a)** Which **expense categories** beyond diesel / tolls / scales should be seeded?
- **(4a)** Does the Relay **transaction upload** already have a fixed format/CSV? (drives the importer.)
- **(2a)** Phase-1 request fields — should the driver pre-enter amount/purpose, or is it dispatcher-set on approval?

---

## 9. Build sequence (gated; migrations need accept-edits + show-the-migration-first)

1. **Diesel-code request type** + dispatcher approval in Driver Hub (Phase 1 typed code, editable, audited) — additive over the request cascade.
2. **Auto-expense rule** on approval (transaction-dated Relay debit, category, load/driver/reefer/STATE+LOCATION).
3. **Relay account treatment** (confirm/re-categorize per 1a) + WF→Relay transfer + fee posting.
4. **Recon importer** (upload feed → match debits/credits → exception queue) — reuse bank-recon.
5. **Phase 2:** Relay API auto-issue (`source=RELAY_API`, dispatcher override; needs assigned load + reefer-hours).
6. **Category map CRUD** + reports (Relay spend by driver/load/state — feeds IFTA + profitability).

All money-path; ships behind a flag **default OFF**; GUARD verifies the diff; design session with Jorge before code.
