# B4 — Reclassify Transactions: "More filters" + Page Capture

**Parent design law:** `QBO_PARITY_UI_SYSTEM.md` PART B §B4.
**Status:** Design / Docs only — non-posting capture. **B4 is a FINANCIAL/GATED page**; this document
captures UI/spec only. Any build of the reclassify-apply action = financial cluster = branch + show
Jorge + wait for OK. No posting, no GL math here.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Grounding:** built from the written design law (§B4) + the locked safety rules — **not from memory of
QBO**. QBO-exact portal contents are marked `[LIVE-CONFIRM]`.

---

## 0. What B4 is (recap from §B4)

A NEW TMS page `/accounting/reclassify-transaction` (mirrors QBO `/app/reclassify-transaction`).
Two-pane: LEFT = account-tree filters; RIGHT = per-account transaction list with a Reclassify action.
Reclassify **re-points existing postings'** account/class/location — it is NOT new GL math; it is
RLS-scoped, period-lock-respecting, and writes `audit.row_changes` per line (embezzlement evidence).
**GATED owner/bookkeeper action.**

---

## 1. LEFT pane — filters (from §B4, made build-precise)

| Control | Options |
|---|---|
| Account types | Profit and loss · Balance sheet |
| Basis | Accrual · Cash |
| From: / To: | date range (period pickers) |
| Type | All · Bill · Check · Credit Card Credit · Credit Memo · Deposit · Expense · Invoice · Journal Entry · Refund · Sales Receipt · Vendor Credit |
| Class | None · All · [class codes — live: 10006, 10012, 10035, …] |
| Location | None · All · [DRIVER/OPERATOR names — IH35 maps Location → driver] |
| Find an account | text search over the account tree |
| **More filters** | portal — contents enumerated in §3 (the owed capture) |

Account tree: grouped, each account row shows a **running AMOUNT**.

---

## 2. RIGHT pane (per selected account) — from §B4

- Header: `Account: <name>` · find-transactions text filter · **Reclassify** button · live counter
  `N lines selected: $X`.
- Columns: `[✓] · Date · Type · Account No. · Account · Memo/Description · Net Amount`.
- Select-all + per-row checkboxes. Pager: First / Prev / `1–N of N` / Next / Last.
- **Reclassify modal:** "Make changes to all N selected lines" →
  `Change account to (+Add) · Change class to (+Add) · Change location to (+Add) · Cancel · Apply`.

---

## 3. "More filters" panel contents — THE OWED CAPTURE

> §B4 marks this `[TODO] "More filters" portal contents — enumerate live`. Below is the **proposed TMS
> filter set** (grounded in the §B4 left-pane filters + the §B6 advancedmatch filter vocabulary that
> QBO reuses across financial grids). Each QBO-exact entry that needs a screenshot is `[LIVE-CONFIRM]`.

**Proposed "More filters" portal (Reclassify):**
1. **Transaction type** — same enum as the Type filter (redundant-but-scoped multi-select). `[LIVE-CONFIRM]` whether QBO repeats it here.
2. **Name / Payee** — vendor/customer/employee picker (filter lines by payee).
3. **Amount** — operator (=, >, <, between) + value(s) in cents.
4. **Memo/Description contains** — text.
5. **Reference no.** — text.
6. **Modified date** — date range (distinct from the transaction From/To).
7. **Entered/Created by** — user (audit dimension — who booked it).
8. **Cleared/Reconciled status** — All · Cleared · Reconciled · Not reconciled (drives the "can't
   reclassify into a reconciled/closed period" guard preview).
9. **Currency** — if multi-currency ever enabled (IH35 = USD; show only if >1 currency). `[LIVE-CONFIRM]`.

**Proposed "More filters" portal (Bank match / §B6 advancedmatch)** — captured here too since the index
lists it as owed:
1. **Record type** — All transactions · Money in · Money out · Suggested matches · Transfers · Rules ·
   Missing payee/customer · Uncategorized (from §B6).
2. **Date range** · **Amount** (operator + value) · **Search** (description / check no. / amount).
3. **Payee/Name** · **Status** (open/cleared). `[LIVE-CONFIRM]` exact portal grouping + any extra rows.

---

## 4. Safety / build constraints (locked, from §B4)

- **Period lock:** no reclassify into a closed period — the modal must preview-block selected lines in
  closed periods (greyed, with reason).
- **Audit:** write `audit.row_changes` per reclassified line (who/when/from→to account/class/location).
- **Mechanic:** reclassify re-points existing postings' account/class/location only — **NO new GL math**,
  RLS-scoped (`SET app.operating_company_id` before reads or counts lie).
- **Non-reclassifiable types** greyed out (e.g. types whose account is structurally fixed).
- **GATED:** owner/bookkeeper action; build PR is financial-cluster = branch + show Jorge + wait OK.
- **Location = driver** mapping (IH35 dimension) — confirm with CPA; reclassifying Location re-tags the
  driver dimension on the posting, not a new entry.

---

## 5. [LIVE-CONFIRM] items still owed from a QBO screenshot
- `[LIVE-CONFIRM]` exact "More filters" portal rows + order + grouping (Reclassify and Bank match).
- `[LIVE-CONFIRM]` whether "More filters" is a slide-in portal vs inline expander.
- `[LIVE-CONFIRM]` exact label strings + any default-selected values.
- `[LIVE-CONFIRM]` the full live Class code list and Location(driver) list (data-dependent).

---

## 6. Acceptance for the eventual build (not built here)
- Reclassify page renders the two-pane layout (§1/§2) with the shared table grammar (A1).
- "More filters" portal implements §3 (after `[LIVE-CONFIRM]` reconciliation).
- Apply respects period-lock, writes `audit.row_changes`, does NO new GL math, RLS-scoped.
- GATED owner/bookkeeper; static CI guard asserts the reclassify-apply path writes an audit row + checks
  period-lock.

## 7. DO NOT
- DO NOT build the reclassify-apply (financial) without Jorge's explicit OK.
- DO NOT add new GL math — reclassify only re-points existing postings.
- DO NOT reclassify into closed periods; DO NOT skip the per-line audit row.
- DO NOT fabricate QBO-exact portal contents; `[LIVE-CONFIRM]` items wait for a live screenshot.
