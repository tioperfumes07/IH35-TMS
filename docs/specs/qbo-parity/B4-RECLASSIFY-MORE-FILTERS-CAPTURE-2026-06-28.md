# B4 — Reclassify Transactions: "More filters" + Page Capture

**Parent design law:** `QBO_PARITY_UI_SYSTEM.md` PART B §B4.
**Status:** Design / Docs only — non-posting capture. **B4 is a FINANCIAL/GATED page**; this document
captures UI/spec only. Any build of the reclassify-apply action = financial cluster = branch + show
Jorge + wait for OK. No posting, no GL math here.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Grounding:** built from the written design law (§B4) + the locked safety rules, **then verified
against the LIVE QBO UI** (IH 35 Transportation LLC, captured 2026-06-28; screenshots local-only — real
financial data — never committed). The owed "More filters" capture is now resolved in §3.

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
| Account types | **Profit and loss · Balance sheet** (live-confirmed, top-left dropdown) |
| Basis | Accrual · Cash |
| From: / To: | date range (period pickers; live default 05/01–05/31) |
| Type | All · Bill · Check · Credit Card Credit · Credit Memo · Deposit · Expense · Invoice · Journal Entry · Refund · Sales Receipt · Vendor Credit |
| Class | Select · [live class codes — data-dependent] |
| **Filters** (funnel icon) | opens the **Filter By** panel — contents live-confirmed in §3 |
| Find an account | text search over the account tree |

Account tree: grouped (Income Accounts, Cost of Goods Sold, Operational Expenses, …), each row shows a
**running AMOUNT**. **Live note:** the top filter row shows **Type** and **Class** inline; **Location**
is NOT inline — it lives inside the **Filter By** panel (§3). The entry control is labeled **"Filters"**
(funnel icon), not "More filters".

---

## 2. RIGHT pane (per selected account) — from §B4

- Header: `Account: <name>` · find-transactions text filter · **Reclassify** button · live counter
  `N lines selected: $X`.
- Columns: `[✓] · Date · Type · Account No. · Account · Memo/Description · Net Amount`.
- Select-all + per-row checkboxes. Pager: First / Prev / `1–N of N` / Next / Last.
- **Reclassify modal:** "Make changes to all N selected lines" →
  `Change account to (+Add) · Change class to (+Add) · Change location to (+Add) · Cancel · Apply`.

---

## 3. "Filter By" panel contents — OWED CAPTURE, NOW LIVE-CONFIRMED (2026-06-28)

Clicking **"Filters"** (funnel icon, top-right of the filter row) opens a **"Filter By"** popover panel.
Live-confirmed contents (in order):

1. **From:** / **To:** — date range (live default 05/01/2026–05/31/2026).
2. **Type** — transaction-type dropdown (All · the §1 Type enum).
3. **Class** — dropdown (Select · live class list).
4. **Location** — dropdown (Select · IH35 = driver names; see §4 mapping). *(Lives in the panel, not the
   inline row.)*
5. **Customer/Vendor** — dropdown (Select).
6. **Modify** — dropdown (default All). *(New vs the prior spec; controls which transactions are eligible
   to modify; option list not fully expanded in capture — a minor follow-up, non-blocking.)*
7. Footer: **Clear all** · **Apply** (green).

> **Reconciliation with my earlier draft:** the live panel is **leaner** than the placeholder I had
> guessed (no Amount / Memo / Reference no. / Modified date / Entered-by / Cleared-status / Currency
> rows). The real set is **From · To · Type · Class · Location · Customer/Vendor · Modify**. The TMS
> Reclassify page should mirror exactly this panel.

> **Bank match (§B6 advancedmatch) "More filters"** is a separate screen; its filters were not opened in
> this pass (Reclassify was the priority). Capture in a later targeted pass — tracked, low priority.

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

## 5. Capture status (2026-06-28)
- **RESOLVED:** Filter By panel rows + order + footer (§3); it is a **popover panel** anchored to the
  "Filters" funnel; Account types = Profit and loss / Balance sheet (§1).
- **Minor follow-ups (non-blocking):** the **Modify** dropdown option list (panel was captured with it
  closed); the full live **Class** + **Location(driver)** lists (data-dependent, change over time); the
  separate **Bank-match** advancedmatch "More filters" screen.

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
- DO NOT commit the source screenshots (real financial data — kept local-only, gitignored).
