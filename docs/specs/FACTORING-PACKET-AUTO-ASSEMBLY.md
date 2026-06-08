# IH35-TMS — Factoring Packet Auto-Assembly
**LOCKED 2026-06-07 | IH35-specific operational requirement**

## Purpose
When a load is delivered and POD is confirmed, automatically assemble the FARO factoring submission packet and queue it for submission/approval.

## Trigger
Load.status = 'delivered' AND POD document uploaded AND POD signed

## Packet Contents (auto-pulled)
- Invoice (generated from rate confirmation data)
- Bill of Lading (BOL — uploaded at pickup stop)
- Proof of Delivery (POD — captured by driver PWA or uploaded)
- Rate Confirmation (uploaded at booking)
- Accessorial documentation (if any accessorials billed)

## Factoring Status States
NOT_FACTORED → PACKET_READY → SUBMITTED → ADVANCE_RECEIVED → RESERVE_RELEASED → CHARGED_BACK (if applicable)

## Where It Lives
- Dispatch: Load Detail Drawer → "Factoring" tab (new tab, additive)
- Factoring sidebar module: full factoring queue + position tracker

## Accounting Integration
On ADVANCE_RECEIVED: auto-post journal entry per CPA-selected treatment (Option A or B from FACTORING-ACCOUNTING-STRUCTURE.md)
On RESERVE_RELEASED: auto-post reserve release entry
On CHARGED_BACK: create insurance.refund_obligation (same pattern as Block F)

## Factoring Reserve Tracker
Show per FARO account:
- Total invoices submitted (count + $)
- Total advances received ($)  
- Total reserve held / Faro Escrow balance ($)
- Total fees paid YTD ($)
- Chargebacks pending ($)
- Estimated reserve release schedule

## Rules
- Packet auto-assembles; dispatcher must APPROVE before submission to FARO
- Never auto-submit without dispatcher approval
- Packet documents link to their source records (load, stop, driver PWA upload)
- All factoring postings use existing createJournalEntry — no new financial code
