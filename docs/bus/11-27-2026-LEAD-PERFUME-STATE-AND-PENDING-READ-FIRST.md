# 11-27-2026 · LEAD (perfume money seat) · state + pending · READ FIRST
Written 2026-11-27 16:00 CT (22:00 UTC) by LEAD (Claude, session 018SGmaUkQzanSDvr9kQzi1k). Perfumes only for 3 days; trucking frozen.
Companion: docs/bus/11-27-2026-P1-PERFUME-STATE-AND-PENDING-READ-FIRST.md (P1 seat). Owner box to LEAD: ROUND P1.31 (owner pasted 15:52 CT).

## Owner messages to LEAD today (Laredo CT)
- 12:03 / 12:04 Testers ≈ 70% of the regular item's price; every product type exists (Tester, Bag, …).
- 12:58 Fast-merge law: green locally → push → merge (4-minute weekend method).
- 13:20 All ~30K items by category in Excel (delivered: TIO-Items-by-Product-Type-2026-11-27.xlsx, Desktop + Downloads).
- 13:41–13:50 Item click must open the profile; item-creator boxes proportional; CONTROL (old TIO POS) screenshots → incorporate.
- 13:58 Flags as a clean dropdown; internal codes + HK Global SKUs linked.
- 14:12 LAW: new TIO company opens at $0 — import customers, items, design data; NO balances.
- 15:05 Perfumes only: fully wire both ways — money, chart of accounts, liabilities, assets, AP, AR, customers, vendors, types, items, catalogs.
- 15:40 "you are taking too long … fast merge law" → targeted local tests + touched guards, then merge.
- 15:50 P1 is the other seat; LEAD is lead. Save today's conversation and pending in the repo and journal.

## Merged today by LEAD (all live)
| PR | what | live proof |
|---|---|---|
| #29938 | tester pricing (tester_of_regular), product types, regular↔tester link (mig 202617070100) | 30,679 typed; 2,944/4,385 testers linked |
| #29939 | MIN_COST_CENTS 100 in every pricer | 0 items under $1 on Wholesale |
| #29942 | item click → profile; ItemCreator proportional | live |
| #29943 | Receivables: aging, customer account, payment entry/void via payment engine | $0 live (0 invoices) |
| #29944 | Flags dropdown; HK code on create | live |
| #29947 | Sales returns → credit memo 4800 (+tax) + restock (mig 202617080100) | list 200 / unknown 404 |
| #29949 | Customer statement (+print) | live |
| #29951 | Physical count cycle: blind sheets by selection, per-line cut-off, variance (mig 202617110100) | Counts tab live; sheet 404 on unknown |
| #29956 | Bill a received perfume PO → A/P via the one bill writer + poster; price difference GRNI↔COGS; FIX vendor return posted Dr Inventory/Cr COGS → now Dr GRNI/Cr Inventory (mig 202617120100) | b514ffc; table RLS forced, 2 policies, 1 trigger |
| #29957 | Purchasing → Payables: A/P aging by vendor (ties to the books' A/P aging SQL to the cent), vendor account, pay one bill via bill engine, vendor statement | 224ba4f; tab live, $0.00 strip, unknown PO 404 |
| #29960 | Vendor credit for billed goods returned (one vendor-credit writer, Dr A/P / Cr GRNI; GRNI nets to 0) (mig 202617130100) | 575573f deployed |
Claims: #29945, #29950, #29954, #29958.

## Measured production facts (22:00 UTC)
ScentsX: 74 accounts; roles bound (AP 2000, AR 1100, GRNI 2050, Inventory 1200, COGS 5000, Sales tax 2100, Returns 4800); 6 posting flags ON (GL, invoice AR, customer payment, bill, bill payment, stock move); 4 bank accounts (1000 Operating Checking, 1010 Store Cash Registers, 1020 Petty Cash, 2010 Business Credit Card). 0 POs, 0 bills, 0 invoices, 0 stock moves (company opens at $0 — owner law 14:12). 1 vendor and 1 customer linked to ScentsX out of 4,821 contact companies.

## PENDING — one numbered list (owner list 15:45 CT + LEAD box P1.31)
P1 (price desk): 1 Purchase/compare defaults Laredo 008 · 2 margin rules per group · 3 round UP to $0.25 · 4 same filters every tab · 5 Sonia list (NEEDS owner's file) · 6 competitor columns default · 7 list analysis multi-competitor · 8 vendor price tiers · 9 names left-aligned · 9a vendor full names · 9b click-through + link 44 price-list vendors to contacts.
LEAD:
- 10 / L1 Rank customers + vendors A/B/C by purchases (12-month + lifetime $, invoices, units); source = ScentsX invoices else the imported history; Contacts + Customer accounts + profile; Excel. Due 2026-11-28 14:00 UTC.
- 10a / L2 Buyer names full + proper case ("Ipbgroup" → "IPB Group"), left, clickable; preview → apply, one history row per rename. Due 2026-11-28 06:00 UTC.
- L3a rls-migration-scan red on 202617080100 (format('%1$s') RLS not read by the scanner). Due 23:30 UTC.
- L3b verify:overpayment-becomes-unapplied-credit selftest red (credit-memos.routes apply_to_invoice). Due 23:30 UTC.
- L3c CodeQL 14 vs 2 — OWNER DECISION, frozen shared code; not touched.
- L4 / 15 Wholesale buyer lists leave out inactive items. Due 23:30 UTC.
- L5 / 16 Rule needed from owner: "Stock item? N" — skip the stock ledger + inventory posting? (question to owner)
- L6 / 14 Purchase bills — DONE (#29956/#29957/#29960): billed ≤ received per line, price difference per line, duplicate vendor invoice refused by the bill writer. The box's "held until the owner approves with a reason" was not said by the owner — not built.
- Next after these: apply a vendor credit from the Payables screen; one check paying several bills (bill engine refuses a repeated check number per bank).
Later: 11 confirm comparison prices into lists. Parked: 12 three unlinked vendor lines; 13 UPC conflicts.
Owner decisions still open: Faro repurchase deadlines (12 USMCA FP accounts — trucking, frozen); CodeQL 14 findings; L5 stock-item rule; Sonia's file (P1).
