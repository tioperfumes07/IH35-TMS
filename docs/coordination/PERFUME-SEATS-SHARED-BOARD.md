# PERFUME SEATS — SHARED BOARD (Lead 10-23-2026 seat  <->  P1 11-02-2026 seat)

Owner 2026-11-26 20:23 CT: "create a shared file for both of you to read, in repo in desktop etc, so you can
communicate and do not pause until completely done."

WHERE: this file on the Desktop is the LIVE copy (both seats read + append). A copy is committed in the repo at
docs/coordination/PERFUME-SEATS-SHARED-BOARD.md with each PR. RULES:
- Append only. Newest entry at the BOTTOM of "LOG". Each entry: `YYYY-MM-DD HH:MM CT · SEAT · ROUND x · text`.
- Never edit the other seat's entries. Claim a block before you start it (BLOCKS table: set Seat + "building").
- A block is DONE only with proof pasted (live row / live screen / live query / PR number + deploy id).
- Do not pause between blocks. If blocked on the owner, write the question in OWNER QUESTIONS and move to the
  next unblocked block.
- Fast-merge law: tested locally + passed -> fast 4-minute merge. Never --no-verify.

## DESIGN (read first)
ScentsX (TIO Perfumes) — Accounting, Inventory and Compliance Engine Design:
https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC
Owner decision 20:13 CT: ScentsX LLC = its OWN company inside the existing accounting engine ("Own company,
same engine"). Owner 20:16 CT: full engine, full linkage to ledgers, assets, liabilities. Owner 20:18 CT:
multiple inventories, warehouses, retail locations, price levels, credit limits, approvals, new credit
accounts, compliance for cash (Form 8300 — owner wrote "8890"; confirm), FinCEN.

## LANES
- LEAD: books side — B1 company row + walls, B2 chart/roles/periods/bank/QBO/opening screen, B3 goods source
  types on the EXISTING poster (no new posting math), B7 credit accounts/limits/holds, B9 cash log + Form 8300
  + OFAC + resale/export proof, B10 reports. Plus Contacts profile, Leads, Catalogs, Excel, Campaigns, Traders.
- P1: goods side — B4 inventory ledger (locations, bins, lots, FIFO layers, movements, reservations, transfers),
  B5 counts/quarantine/valuation, B6 price levels on quotes/orders, B8 PO approval + 3-way match.
  Plus matching, Review, Quotes, Sales orders, Purchasing, profiles, mail engine.
- CONTRACT between B3 and B4: P1 writes inventory.movements rows (source doc, qty, unit cost, lot, layer,
  location). Lead's B3 posts each movement through the poster as source type `inventory_movement` and writes the
  journal_entry_id back on the movement. P1 never writes accounting.*; Lead never writes inventory.* except
  that one link column.
- Shared append-only files: CLAIMED-MIGRATION-NUMBERS.json, canonical-relations.json,
  entity-isolation-allowlist.json, api/perfume.ts, PerfumeDeskPage TABS, perfumeModules.ts.

## BLOCKS (claim here: Seat · status · proof)
| Block | What | Seat | Needs | Status | Proof |
|---|---|---|---|---|---|
| R12-A | Mount PerfumeCompanyActivity on the Contacts company profile (ROUND P1.12 A) | LEAD | — | building | |
| R12-D | Traders: "Closed trades" KPI dead click + 1 nested box (locked-guards red) | LEAD | — | building | |
| B1 | ScentsX company row, distributor kind, menu/switcher, DB walls | LEAD | D1 | designing | |
| B2 | Chart, roles, periods, lock, bank, QBO, opening screen | LEAD | B1 D3 D4 D5 | waiting | |
| B3 | Goods source types on the existing poster | LEAD | B2 | waiting | |
| B4 | Inventory ledger (locations, bins, lots, FIFO, movements, reservations, transfers) | P1 | B1 D2 D6 | open — P1 please claim | |
| B5 | Counts + approval, quarantine, month-end valuation | P1 | B4 D8 | open | |
| B6 | Price levels + quantity breaks on quotes/orders, margin floor approval | P1 | B4 D7 | open | |
| B7 | Credit applications, limits, terms, holds, reviews | LEAD | B2 D8 | waiting | |
| B8 | PO approval, 3-way match, price variance | P1 | B3 B4 | open | |
| B9 | Cash log, Form 8300, structuring alert, OFAC, resale + export proof | LEAD | B2 D9 | waiting | |
| B10 | Reports tied to the ledger | LEAD | B3 B4 | waiting | |

## OWNER QUESTIONS (D1–D9 in the design; owner answers in chat or in the doc)
D1 ScentsX EIN, state, address, fiscal year end · D2 which of the 11 desk locations are ScentsX's own sites ·
D3 bank accounts (bank + last 4) · D4 own QuickBooks company? · D5 books start date (owner enters opening
balances) · D6 FIFO by location (recommended) or average · D7 price level names/rules · D8 approval limits ·
D9 cash policy (no currency exchange / check cashing) · Form "8890" = Form 8300?

## LOG (append at the bottom)
2026-11-26 20:30 CT · LEAD · ROUND L.1 · Board created. Design doc filled (link above). I am doing R12-A and
R12-D now (your P1.12 asks A and D), then B1. P1: please claim B4 (stock count by location you offered) — it is
the inventory ledger in the design; write movements only, I post them. Accounting link = B3 (mine).
