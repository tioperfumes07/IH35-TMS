# PLAN FOR CLAUDE — CONFIRM OR CONCUR (owner 2026-08-30 17:34 CT)

Owner: Jorge. He follows Cursor’s recommendation on 016. Paste this back if you concur; if you dissent, name the exact line.

---

## Owner ruling (CLOSED)

**Faro invoice 016 / MPH / AlwaysTrack load 13524**

- **Invoice and factor at Faro face $3,800** (what Faro bought and what they wired against: **$3,676** after reserve/fee/wire).
- AlwaysTrack **Charges $4,200** is what was **invoiced** (AT invoice 13524: $4,200, QP $0).
- Faro bought **$3,800** after the fact. Owner: brokers **usually deduct afterwards** (late). **Nobody watches email or adjusts the invoice** — that is where control is lost.
- **Do not paper over it by creating only a $3,800 invoice.** That makes Faro match and **hides the missing adjustment**.
- **Correct sequence to test the six modules:**
  1. Create the USMCA invoice at **$4,200** (hauled / billed).
  2. Record the **$400 customer/broker late deduction** as a **subsequent document** (credit memo / invoice adjustment / short-pay) on the **same load** — the step the office currently skips.
  3. Factor **net $3,800** as Faro **016** (wired $3,676).
- If the app cannot do step 2, that is a **P0 FINDING** (the control hole). Still do not skip 016; still do not shrink Faro expected **$95,075**. CC-1 logs the blocked screen and continues.
- AT has **no $400 line** (driver deductions on 13524 = $235, not $400). The deduction lives **outside** AT — email/broker. TMS must capture it or we keep losing control.

ASC 860: pledged A/R must exist. After the $400 adjustment, **net $3,800** is what Faro buys (PO **MPHC261334**). Do not invent QBO 016. Do not wait for a QBO doc.

**Carve-out 1 HOLD 016 is VOID.** CC-1 creates the load invoice **and** the $400 subsequent deduction, then factors **net $3,800**.

---

## What this run is / is not

**Bar-1 (tonight, browser, real August USMCA):** loads, invoices, settlements, factoring, diesel, expenses, bills — through the app, date order, `is_sample_data` false. Proves screens, writes, and cross-module links. A blocked screen is a FINDING.

**Bar-2 (the certify gate):** each Urgent-6 module ties to an **outside document** at **tolerance $0**. Internal JE ↔ factoring_advances ↔ invoices is **wiring**, not certify. Faro schedule + remittance is the factoring outside document.

**Urgent 6 is not certified off bar-1 alone.** Board until bar-2 is green: *bar-1 connectivity on live August USMCA books; bar-2 pending.* Do not flip `complete: true`. Do not shrink expected totals to match the app.

Proof that bar-1 cannot certify: `#18318` — screens, DB, guards, and a balanced JE all matched a **wrong** reserve/fee.

---

## Frozen Faro expected (do not edit to go green)

| Item | USD |
|------|-----|
| Face (33 invoices **including 016**) | **95,075.00** |
| Escrow reserve | **1,426.13** |
| Discount fee | **1,426.13** |
| Wire fees | **120.00** |
| Net advance / cash | **92,102.74** |
| NFE | **88,648.87** |

With 016 created at $3,800, factoring **should tie at $0** on face (016 is in the 33). The **$400** lives on the **load vs invoice** exception list, not in Faro face.

---

## Data rules (amendment, still in force except HOLD 016)

1. **Crosswalk only** (`CC-1-FARO-QBO-AT-CROSSWALK.csv`). Never customer+amount. Never AlwaysTrack **Total** (QP-net). Use **Charges**.
2. **One load, one TMS invoice.** Create the **3-digit QBO** doc, not the duplicate `13xxx` (019 not 13526, etc.). Triple **006**: create only BV $2,600 “Load Number - 006”.
3. **QBO A/R +$24,800** duplicates: owner/Martin **in QuickBooks** (void/credit memo). **No TMS→QBO write-back.** Do not import the error.
4. **Do not cite** `mdata.qbo_ar_invoices` as **absence**. Mirror stale ~08/14; live QBO to **036**.
5. Live QBO company = **USMCA Freight Solutions, Inc.** (Transportation file renamed). TMS clone still keyed TRANSP.
6. **007 ITS:** no AT load (outage) is correct. Grade **QBO $250 vs Faro $350**. Finding = $100 + missing PO. Create from Faro/QBO as the specimen requires; do not hunt July Load History.
7. Named leftovers: **009** FLS $525 and **010** SCM $4,000 unfactored (owner). **026** IM Specialized direct-pay **closed** (BoA 08/26 $3,032.60).

---

## Seats

| Seat | Do |
|------|----|
| **CC-1** | Amendment (minus HOLD 016). **L13512** 12-step specimen first. Then Faro **33 including 016 at $3,800**. Settlements = USMCA loads only on mixed AT settlements. Diesel/expenses on those loads. Through the browser. Blocker = FINDING, keep going. |
| **CC-2** | Grade. Do not build. Factoring expected **stays $95,075**. If 016 is missing, FAIL $3,800 — that would now be a **CC-1 miss**, not an owner hold. $400 AT vs Faro is **not** a factoring fail. Standing-by = defect. |
| **Cursor** | Bar-2 guard vs frozen Faro JSON. GL **1296** Faro proceeds (not global `cash_clearing`). Guard **one-load-one-open-invoice**. Deploy. Lead/bus. |
| **CC-3 / Codex / Cascade** | Not the books. Unique leftover / ITEM 2 / unique FINDING. |

---

## Certify tonight — honest bar

- **Can do tonight:** bar-1 on real data; land bar-2 **gate**; 016 on-book at $3,800 so factoring **can** hit $0 on Faro face.
- **Cannot stamp certified** until bar-2 is **PROD-VERIFIED $0** per module against the outside doc (Faro / bank stmt / settlement PDF / TB / AP aging / load revenue).
- **$400** remains an OPEN named exception on **dispatch/load vs invoice**, not a license to change Faro $95,075.

If Claude concurs, execute this plan as written. If not, he names the dissenting line only.
