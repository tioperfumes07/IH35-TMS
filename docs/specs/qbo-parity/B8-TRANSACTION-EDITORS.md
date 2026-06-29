# B8 — QBO Transaction Editors — Capture (design, non-posting)

**Status:** Design / Docs only. No posting code, no migration. Every GL posting path is
**financial/Tier-1 — OUT OF SCOPE here**; this doc captures the editor **chrome + read paths** and marks
posting **GATED**. BUILD-AND-HOLD; Jorge merges.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Grounding:** `QBO_PARITY_UI_SYSTEM.md` §B8 (editor list + Expense capture) + `docs/trackers/
QBO-FEATURE-PARITY-REQUIREMENTS.md` Modules 5/6/7 (Bill/Invoice/Expense forms) + the **live Expense
editor captured 2026-06-28** (IH 35 Transportation LLC; screenshot local-only, not committed). QBO-exact
details not verified live = **`[LIVE-CONFIRM]`** (not fabricated).
**Vocab rule (locked):** primary buttons are **"+ Create" / "+ Book"** — never "+ New"/"+ Add". The
inline dropdown affordance "+ Add new" (A2) is the only exception.

---

## 0. Editor set (confirmed against repo, not assumed)
From `QBO_PARITY_UI_SYSTEM.md` §B8 + parity-req modules. **All are full-page editors** (A3 sizing rule),
dense line grids, sticky footer. Each posting path is **GATED/Tier-1 OUT OF SCOPE**.

| # | Editor | Repo grounding | Posting |
|---|---|---|---|
| 1 | **Expense** | parity-req M7 + **live capture** | GATED |
| 2 | **Bill** | parity-req M5 | GATED |
| 3 | **Invoice** | parity-req M6 | GATED |
| 4 | **Check** | §B8 list | GATED |
| 5 | **Bill Payment** | §B8 list | GATED |
| 6 | **Vendor Credit** | §B8 list | GATED |
| 7 | **Purchase Order** | §B8 list | GATED (PO is non-posting in QBO, but workflow-gated here) |
| 8 | **Sales Receipt** | §B8 list | GATED |
| 9 | **Receive Payment** | §B8 list | GATED |
| 10 | **Deposit** | §B8 list | GATED |
| 11 | **Journal Entry** | §B8 list + ManualJE page exists | GATED |
| 12 | **Transfer** | §B8 list | GATED |
| 13 | **Credit Memo** | parity-req M6 context | GATED `[LIVE-CONFIRM]` |
| 14 | **Estimate** | parity-req M6 context | non-posting `[LIVE-CONFIRM]` |

> Build sequencing note: Expense/Bill/Invoice are the priority three (parity-req has full form specs);
> the rest are captured at structure level here, pixel-detail `[LIVE-CONFIRM]` before pixel build.

---

## 1. Expense (`/app/expense`) — LIVE-CAPTURED
- **Layout:** full page. Header: "Expense #<no>" · Copy · online-banking-match link · **Payee(+Add)** ·
  **Payment account** (shows running Balance) · **Amount** · **Payment Date** · **Payment Method** ·
  **Ref no.** · **Location**.
- **IH35 TRUCKING CUSTOM FIELDS (KEEP — live-confirmed present):** Settlement No · Truck No · Pick Up
  Date · Delivery Date · SB-Load No · Empty Miles · Loaded Miles · Work Order.
- **Line sections (toggle):** **Category details** (# · Category(+Add) · Description · Amount · Billable ·
  Customer · Class) | **Item details** (# · Product/Service(+Add) · SKU · Description · Qty · Rate ·
  Amount · Billable · Customer · Class). "Add lines" / "Clear all lines".
- **Right rail:** "Autofill this expense" (drag-drop docs: PDF/PNG/JPEG/HEIC). Memo · Attachments (20MB).
- **Footer (live):** Cancel · **Make recurring** · **Save** · **Save and close** (green ▾).
- **Posting:** Dr Category/Item lines / Cr Payment account — **GATED/Tier-1, OUT OF SCOPE**. Editing a
  reconciled txn shows the "R — may affect a completed reconciliation" warning.

## 2. Bill (`/app/bill`) — parity-req M5
- **Header:** Vendor*(+Add) · Mailing address (auto from vendor) · Terms (auto, override) · Bill date* ·
  Due date* (auto from terms) · Bill # (vendor invoice no.) · Memo.
- **Category details:** Account(+Add) · Description · Amount · Class · Project · Customer/Job · **Unit**
  (TMS ext). **Item details:** Item(+Add) · Description · Qty · Rate · Amount · Class · Project.
- **Footer:** Total/Subtotal/Sales tax · Attachments · **Save · Save and close · Save and new ·
  Make Payment**. Paid bills read-only with **Void** (VOID-PR2). TMS ext: link bill→load, fuel-card
  overlap detect.
- **Posting:** Dr Expense/Asset / Cr AP — **GATED/Tier-1**.

## 3. Invoice (`/app/invoice`) — parity-req M6
- **Header:** Customer*(+Add) · Email (auto) · Billing/Shipping · Terms (auto) · Invoice date* · Due
  date* (auto) · Invoice # (auto, editable) · PO number.
- **Line items:** Product/Service(+Add) · Description · Qty · Rate · Amount · Tax · [+ Add line / subtotal
  / discount]. Footer: Message · Memo · Discount · Sales tax · Total · Balance due. Attachments (BOL/POD).
- **Footer buttons:** Save · Save and Send · Save and Close · Save and New. TMS ext: auto-populate from
  load (revenue + accessorials), "Factor this invoice", per-stop invoicing.
- **Posting:** Dr AR / Cr Revenue (+ Cr Tax) — **GATED/Tier-1**.

## 4. Check (`/app/check`) `[LIVE-CONFIRM]`
Header: Payee(+Add) · Bank account (running balance) · Payment date · Check no. · Memo. Category +
Item detail lines (as Expense). Footer Print-check option. Posting Dr lines / Cr Bank — **GATED**.

## 5. Bill Payment `[LIVE-CONFIRM]`
Select Vendor → outstanding bills table (checkbox + amount-to-pay) · Payment account · date · ref. Applies
payment to bill(s). Posting Dr AP / Cr Bank — **GATED**. Voiding a payment unblocks bill void (VOID-PR2).

## 6. Vendor Credit `[LIVE-CONFIRM]`
Header: Vendor(+Add) · Payment date · Ref · Category/Item lines. Reduces AP (applied to future bills).
Posting Dr AP / Cr Expense — **GATED**.

## 7. Purchase Order `[LIVE-CONFIRM]`
Header: Vendor(+Add) · Ship-to · date · PO #. Item/Category lines. **Non-posting** in QBO (memo doc);
converts to a Bill. Status open/closed. Gated by workflow flag.

## 8. Sales Receipt `[LIVE-CONFIRM]`
Like Invoice but paid-at-point-of-sale (no AR). Deposit-to account. Posting Dr Bank / Cr Revenue (+Tax) —
**GATED**.

## 9. Receive Payment `[LIVE-CONFIRM]`
Select Customer → open invoices table (apply amounts) · Deposit-to · date · method · ref. Posting Dr Bank /
Cr AR — **GATED**.

## 10. Deposit `[LIVE-CONFIRM]`
Deposit-to account · date · lines (Received From · Account · Description · Amount) + "from Undeposited
Funds" picker. Posting Dr Bank / Cr line accounts — **GATED**.

## 11. Journal Entry (`/app/journal`) — ManualJE page exists in repo
Header: Journal date · Journal no. · Memo. Grid: # · Account(+Add) · Debits · Credits · Description ·
Name · Class · Location. **Must balance** (Σ Dr = Σ Cr) or save is refused. Posting — **GATED/Tier-1**.
(Reuse the existing ManualJE list/detail pages — additive, do not fork.)

## 12. Transfer `[LIVE-CONFIRM]`
Transfer Funds From (account) · To (account) · Amount · Date · Memo. Posting Dr To-bank / Cr From-bank —
**GATED**.

## 13. Credit Memo `[LIVE-CONFIRM]` · 14. Estimate `[LIVE-CONFIRM]`
Credit Memo = customer credit (reduces AR; Dr Revenue / Cr AR — GATED). Estimate = non-posting quote that
converts to Invoice. Both pixel-detail `[LIVE-CONFIRM]`.

---

## 15. Cross-cutting (all editors)
- **Full-page** editors (A3); dense line grids; sticky footer; every reference dropdown carries the A2
  **"+ Add new"** at top (see A2 capture). KEEP the IH35 trucking custom fields where present (Expense §1).
- **Footer actions vary** by editor (Save / Save and close / Save and new / Save and Send / Make Payment);
  captured per editor; `[LIVE-CONFIRM]` the exact set per editor before pixel build.
- **More menu** (parity-req line 812 — all forms): Delete · **Void** · Reverse · Transaction journal ·
  Audit history. Void → VOID-EVERYWHERE (PR-1/2/3). Reconciled-row edit warning applies.
- **Per-entity** (`operating_company_id`); TRK/TRANSP/USMCA share nothing. RLS-scoped reads.

## 16. Acceptance
Editor set grounded in repo (§B8 + parity-req, not invented); Expense fully live-captured;
Bill/Invoice grounded in parity-req; remaining editors structured + `[LIVE-CONFIRM]` for pixel detail;
all posting marked **GATED/Tier-1**; "+ Create"/"+ Book" vocab; per-entity.

## 17. DO NOT
- DO NOT build any editor's GL posting (Tier-1 financial; separate authorized PR).
- DO NOT use "+ New"/"+ Add" primary vocab (only "+ Create"/"+ Book"; A2 inline = "+ Add new").
- DO NOT fabricate QBO chrome — `[LIVE-CONFIRM]` the unverified editors.
- DO NOT drop the IH35 trucking custom fields. DO NOT fork the existing ManualJE pages.
