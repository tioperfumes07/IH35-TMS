# 11-27-2026 · P1 (perfume seat) · state + pending · READ FIRST
Written 2026-11-27 15:55 CT (21:55 UTC) by P1 (Claude, session 018RJJJvfnMxDrHkPT1bSH1H). Perfumes only for 3 days; trucking frozen.

## Owner messages today (Laredo CT, gist / verbatim where quoted)
- 12:05 "Continue … we will finish these 3 later" — 3 unlinked vendor lines parked (Valaya DUMMY, Jus de Amour, no-name La Esperanza line).
- 12:26 Year editions (RE 26 / COLL 26 / 25 / LTD ED) stay separate from the regular bottle.
- 13:09 UPC conflicts: majority vendors with same UPC + description win (Oni wrong); keep the 483 not-in-stock items; 90/100/105/120 ml = same bottle, 90 vs 30 not; merge VS lotions. "I FOLLOW YOUR RECOMMENDATION."
- 13:41 "continue you are not to stop at all."
- 14:05 / 14:14 / 14:15 Customer workbook: purchases per month, totals, invoices per month only (no balances, returns, credits); Mexico in pesos, +IVA 2020–2021; Ricardo Moreno and Esthelita Gzlz are customers. Then "coordinate with other claude agent and finish all the pending work in perfume app."
- 15:05 "perfumes only … fully wire, reverse route … chart of accounts, liabilities, assets, ap, ar, customers, vendors, types, items, catalogs … fast 4 minute weekend merge method."
- 15:40 Price desk orders (see pending 1–11). 15:42 "laredo warehouse stock is 008 warehouse"; names / descriptions LEFT, not centered, like Excel.
- 15:47 Vendor names complete ("B&S" → "B&S Fragrances"); everything clickable like QuickBooks (vendor → profile, brand → its items); large brands may be abbreviated (Paco R., D&G, JPG); buyers left side, full company name, proper case ("Ipbgroup" → "IPB Group"); supplier profiles clickable — "it is the same thing as vendors profiles right?"
- 15:48 Instructions for LEAD in a copy-paste box. Save today's conversation + pending in repo and journal.

## Merged today by P1 (all live unless noted)
| PR | sha | what | proof |
|---|---|---|---|
| #29932/#29934 | — | void / restore price lists + history (migration 202617060500) | live |
| #29940/#29941 | — | UPC confirm moves lines; same-bottle sizes ≤ 1.35× | live |
| #29946 | 9c743b6e0f | claim 202617100100 | — |
| #29948 | c20dd4e7cb | CONTROL item fields (POS code, ticket desc, pack/units, preferred vendor, stock, active, special/min price, price lock); order lines below minimum refused unless reason → item_events price_override; inactive hidden from picker | healthz c20dd4e7cb; GET /item-file/:id returns the 10 fields |
| #29952 | 8453a31a62 | Inquiry & reports: Items inquiry, Sales inquiry (by item / customer + drill), Price book (+PDF), Inventory status, Product families | healthz 8453a31a62; item "1M BLACK RE26": Retail $73.13 / Wholesale $67.50 / Distributor $62.68 / Export MX $60.17 from avg cost $52.65 |
| #29955 | c1694054e5 | "Buy this order" uses item's preferred vendor first | merged ~1 min after open (rule is 4) — owned |
| #29953 | closed | my vendor-bill claim — dropped, LEAD owns purchase bills (202617120100) | — |
Deliverable: ~/Desktop + ~/Downloads 11-27-2026-TIO-Customers-Sales-USA-and-Mexico.xlsx (USA 815 customers / 18,050 invoices / $77,243,596.30; Mexico 674 / MXN 1,139,242,665.19).

Measured prod facts (21:45 UTC): perfume.item_stock 0 rows, item_families 0, stock_moves 0, ScentsX invoices 0, sales_orders 0 (company opens at $0). Inventory file 008 = 204,210 units on 1,547 lines. Vendors: 47 price-list vendors, all with a short name, 44 not linked to a contact company. Contacts: 2,871 customer / 529 vendor / 201 both. Sonia: no vendor, no list in the app. Omni: vendor, 0 current lists. Desk rule round_step = "1" (exact).

## PENDING — numbered (owner list 15:45 CT)
P1 (price desk):
1. Purchase · compare vendors default = Laredo 008 qty; first last purchase date, qty purchased, qty sold, current inventory, avg cost, last cost. — IN PR (branch claude/perfume-desk-buy-laredo-defaults)
2. Margin rules with filters per group (Exclusive, New launches, Testers, Minis, Sets, Regular + brand/type).
3. Calculated prices round UP to next $0.25.
4. Same filters on every tab (Trading sell-to-vendors with their %, Wholesale, Competition, List analysis, All items, My offer / My inventory / Need to buy).
5. Sonia's list missing — NEED owner's latest Sonia price list file.
6. Competitor columns default = list price + real price only (Wholesale, Competition, List analysis).
7. List analysis: vendor or competitor, multi-select competitors.
8. Vendor price tiers High / Medium / Low on common items (low: Jizan, Rdalan, MTZ, PCA, M4) → feeds Trading %.
9. Names / descriptions left-aligned in every perfume list (desk grid IN PR).
9a. Vendor FULL names everywhere (B&S → B&S Fragrances); abbreviations only for large brands (Paco R., D&G, JPG).
9b. Click-through like QuickBooks: vendor → its profile, brand → its items, item → profile; link the 44 unlinked price-list vendors to their contact company so Supplier profile and Vendor profile are ONE record.
LEAD:
10. Rank customers + vendors by purchase capacity / qty (tiers A/B/C).
10a. Buyers: full names, proper case ("Ipbgroup" → "IPB Group"), left, clickable.
Later:
11. Confirm new prices from a comparison into my lists.
Parked by owner:
12. 3 unlinked vendor lines. 13. 264 UPC conflicts outside stock; Bella Vita 85715333001 held.
Waiting on LEAD: 14 purchase bills · 15 inactive items off wholesale lists · 16 non-stock rule · 17 main reds (rls scan on 202617080100, credit-memo selftest, CodeQL 14 vs 2 — owner decision, frozen code).

## Answer to owner 15:47 "supplier profiles = vendor profiles?"
Not today. "Supplier profiles" = the 47 price-list vendors (perfume.vendors). "Vendors" under Leads = 529 contact companies (+201 both). Only 3 of 47 are linked (vendors.company_id). Pending 9b makes them one record.

## LEAD box
Saved: ~/Downloads/11-27-2026-LEAD-ROUND-P1.31-Owner-Perfume-Split.md (owner pastes it).
