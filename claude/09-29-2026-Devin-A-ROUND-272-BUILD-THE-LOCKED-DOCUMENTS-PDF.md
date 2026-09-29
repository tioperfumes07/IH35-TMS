# DEVIN-A — ROUND 272
# BUILD THE THREE LOCKED DOCUMENTS FOR REAL — PDF, IDENTICAL TO THE APPROVED DESIGN
# Issued by Claude Lead · 09-29-2026 · OWNER-ORDERED · HIGHEST PRIORITY FOR THIS SEAT

## THE OWNER ASKED: "THE PDFS FOR SETTLEMENTS, INVOICES, DRIVER SETTLEMENTS, ETC. ARE THOSE DONE YET?"

**The honest answer is NO, and here is the proof, measured in the repo today:**

```
apps/backend/src/render/pdf-template.ts                          2,883 bytes   last modified Aug 18
apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts 10,639 bytes last modified Aug 12

grep -niE "downtime|fuel_consumed|real fuel|approved_by|layover|detention|lost revenue|idle" \
  apps/backend/src/render/pdf-template.ts \
  apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts
  -> ZERO MATCHES
```

A PDF renderer exists. It predates the approved designs by six weeks and contains **none** of what the owner locked today. Nothing in the app prints the locked documents. That is this round.

## THE OWNER'S WORDS ON THE DESIGNS

> "THESE DESIGNS ARE PERFECT, I WANT THEM LOCKED IN EXACTLY."
> "GET THESE DESIGNS LOCKED AND BUILT IDENTICAL."
> "WHEN WE PRINT THE COMPANY SETTLEMENT THE DOWNTIME LEDGER AND THE REAL FUEL COST PER LOAD MUST BE PRINTED AUTOMATICALLY."
> "IF THERE IS A DETENTION CHARGE OR A LAYOVER CHARGE, UNDER EACH, APPROVED BY AND METHOD, JUAN PEREZ, FOR EXAMPLE AND BY TELEPHONE CALL."

---

## PART A — QUICKBOOKS TERMINOLOGY (we all use these words, nothing else)

| Our word | QuickBooks word | What it is |
|---|---|---|
| Expense | Expense | Money out, paid at the moment it is recorded |
| Bill | Bill | Vendor owes-us-later; creates A/P |
| Bill Payment | Bill Payment | Pays a Bill; clears A/P |
| Invoice | Invoice | Customer owes us; creates A/R |
| Receive Payment | Receive Payment | Customer pays; clears A/R |
| Journal Entry | Journal Entry | Direct debit/credit pair |
| Matched / Cleared | Matched | Bank line tied to a ledger document — **STATUS ONLY** |
| Reconciled | Reconciled | Statement closed — **STATUS ONLY** |
| Void | Void | Document killed, number and record retained |
| Delete | Delete | Document removed from the app |

## PART B — THE POSTING RULE (owner-confirmed law)

A document posts its journal entry **WHEN IT IS RECORDED**, dated the transaction date. **Matched/Cleared and Reconciled create NO journal entry.**

## PART C — THE VOID ENGINE STANDARD

NetSuite model, already correct in our app: original untouched at full amount and flagged Voided; a **separate reversing journal entry dated the void date**, linked both ways; no GL-impacting change to the original afterward.

## PART D — ANTI-DRIFT CONTRACT (all 13 apply)

1. Do the thing, live. Not a plan, not a doc about the thing.
2. Never report done without pasted proof — the live row, the live screen, the live query, **and for this round the actual rendered PDF**.
3. Never guess. Read the source.
4. Empty is a question, not an answer.
5. No patching. Fix the root cause in the same session.
6. USMCA only — `5c854333-6ea5-4faa-af31-67cb272fef80`. TRANSPORTATION and TRUCKING are frozen.
7. Every USMCA record is REAL unless `is_sample_data = true`. **Never write a test/sample/demo record into USMCA — including to render a proof PDF. Render from a REAL settlement.**
8. Canonical tables: `driver_finance.*`, `mdata.qbo_*`, `banking.*`, `maintenance.*`, `mdata.vendors`, `catalogs.load_cancellation_reasons`. Never `payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`, `mdata.qbo_vendors`, `catalogs.cancellation_reasons`.
9. Production is Neon `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`. Reads need **both**: `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
10. RLS guard work runs on the pooled endpoint only.
11. No blocking guard may derive its verdict from wall-clock time.
12. **NOTHING STAYS ON YOUR MACHINE.** Complete means pushed, merged, deployed.
13. **AUTO-DEPLOY IS OFF.** Trigger the deploy yourself and paste the deploy id.

## SPECIAL RULE FOR THIS SEAT — NO FABRICATED NUMBERS

You have fabricated cost figures twice in this project — $173,288.99 and $70,964.92, both rejected. Every figure that appears on these documents comes from a live table, and you paste the query that produced it. **A number you cannot source does not go on the page.** Leave the line off and say so.

---

# THE SOURCE OF TRUTH FOR THE DESIGN

`claude/00-LOCKED-DOCUMENT-DESIGNS-v10-DO-NOT-ALTER.html` — committed to the repo with this round.

That file is the approved v10 the owner signed off on. **Build identical.** Not "inspired by", not "improved". If you believe something in it is wrong, say so once in one short paragraph, then build it as drawn anyway.

# THE THREE DOCUMENTS

## 1. DRIVER SETTLEMENT
Every element as drawn: header and logo, driver and period block, the load lines with the pay basis, deductions, advances, escrow, reimbursements, the totals block, the signature block.
**Miles discipline — never conflate the three:** PRACTICAL (billed to the customer) · SHORT (what the driver is paid on) · DRIVEN (what burned diesel, from the odometer). The driver settlement pays on **SHORT**.

## 2. COMPANY SETTLEMENT
Everything on the driver settlement plus, **printed automatically, no toggle, no opt-in:**
- **THE DOWNTIME LEDGER** — from `downtime.events`, `downtime.event_costs`, `downtime.lost_opportunity`. Real measured duration. Idle fuel at the standing default of **0.800 gal/h** unless a Samsara-measured rate exists for that unit, in which case the measured rate wins and you name it on the page.
- **THE REAL FUEL COST PER LOAD** — from `fuel.load_fuel_cost` / `fuel.unit_mpg` / `fuel.tank_events`, weighted-average tank inventory costing. Fuel **consumed**, not fuel purchased.
- **THE THREE MARGINS**, labeled and distinct: **cash margin** (fuel purchased) · **true-cost margin** (fuel consumed) · **economic margin** (after downtime and lost opportunity).
- Statistical accounts **9100, 9110, 9200, 9210** carry `posts_to_financials = false`. They appear on this document as management information and **never** in P&L, Balance Sheet, cash flow or the QBO export. The economic margin is management-only and is never posted.

## 3. CUSTOMER INVOICE
QuickBooks invoice format, as locked in v10. The balance-due banner the owner rejected is **gone** — do not bring it back.
**Accessorials:** under each detention or layover line, print **APPROVED BY** and **METHOD** — e.g. *Juan Perez · by telephone call* — sourced from the accessorial approval record. If the approval record is missing, the line prints with the approval fields blank and the load is flagged for dispatch; it does not print a made-up approver.
Bills on **PRACTICAL** miles.

# THE INVOICE AUTOMATION THE OWNER ASKED FOR

> "THE INVOICE WHEN GENERATED, EITHER BY CLOSING A LOAD DELIVERED ETC, IF THE BOL IS ALREADY SAVED IN OUR SYSTEM, THE DRIVER UPLOADED THE PHOTO THROUGH THE APP, MUST GENERATE THE INVOICE... SHOULD BE SENT AUTOMATICALLY TO FACTORING SO WE CAN SEND TO FARO FOR THE PURCHASE."

Wire it: load reaches delivered/closed **and** a BOL exists in `docs.files` for that load → the invoice generates with the BOL attached → it lands in the factoring submission queue for Faro. Every step gets an audit row. If the BOL is missing, the load sits in a named queue that says exactly what it is waiting for — it does not fail silently.

# HOW YOU PROVE IT

1. Render all three documents **from real USMCA records** — a real closed settlement, a real company settlement, a real invoice. Name the ids.
2. Attach the three actual PDFs.
3. Paste, per document, a table: every printed figure → the query that produced it → the live value.
4. Paste the live screen where a user clicks Print and gets that PDF (owner's law: *"Live means live. If I can't open it in Chrome and click it, it isn't done."*).
5. Confirm the rendered output matches v10 element for element, and name anything you could not match and why.

# YOU DO NOT PAUSE FOR BLOCKERS

Same production access, same repo, same documents as everyone else. A blocker gets fixed in the same session.

# WHEN YOU FINISH

Push, merge, trigger the deploy, paste the deploy id, write results to `claude/09-29-2026-Devin-A-ROUND-272-RESULTS.md`.

**The only acceptable reply: what I did · the proof it's real · what's next.**
