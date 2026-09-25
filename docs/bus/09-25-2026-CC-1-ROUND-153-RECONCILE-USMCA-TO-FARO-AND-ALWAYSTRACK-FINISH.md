# ROUND 153 — CC-1 — FINISH THE RECONCILIATION. ONE JOB, START TO FINISH, NO SWITCHING.
Claude Lead, 2026-09-25 2:45 AM CT (07:45Z). Owner: *"i want it reconciled linked corretly etc as it sohuld be ... each coder
must complete its task and job ... no switching. no deviating, from start to finish."*
Measured live 07:32Z on `db21870f90` (Neon br-fancy-credit-akjnd07a, bypass in-tx, USMCA only). **Already true — do not
touch:** `verify-alwaystrack-parity` 34/34 exact, A–E PASS · Faro 89 advances, face 311,587.00, advanced 302,019.36 ·
ledger nets 0 · healthz ledger.* green. Read `docs/handoff/2026-09-25-claude-usmca-close/00-HANDOFF-READ-FIRST.md` first.

## YOUR SIX ITEMS — IN THIS ORDER, EACH CLOSED WITH PROOF BEFORE THE NEXT
**1. Transportation loads out of USMCA.** Handoff law: *"Pre-Faro 5753 + 5760–5768 = TRANSP/QBO — NOT USMCA."* Live in USMCA
anyway: loads **13481 13482 13485 13487 13489 13493 13494 13495 13496 13500 13501** — 11 invoices **$37,659.00** sent, 10 driver
bills unsettled. Plus **13544** and **90007** (no signed document, invoices $950.00). Void load + invoice + bill + any JE through the
existing void/reversal engines (six exist, no seventh), reason cites the handoff law. Never delete. Before: prove none carries a
Faro advance. After: 0 of those 13 live; parity still 34/34; ar_tieout green.
**2. Customer receipts, so A/R renders like Faro.** Live: 0 of 125 invoices carry a payment; GL 1100 = **435,366.00**. Faro:
receipts **12,825.00**, 6 invoices closed, A/R **298,762.00** (`03-SOURCE-DOCUMENTS/PAYMENTS TO USMCA FROM FARO.csv`, `AGING REPORT.csv`,
`faro_reconciliation_register.csv`). Apply each receipt to its invoice through the existing payment writer, dated as Faro dates it.
Required: every factored invoice's open balance = Faro AGING for that invoice, to the cent; factored open total = 298,762.00.
**3. Charge lines.** `dispatch.load_charge_lines` = **0 of 125** live loads. Write them from each load's invoice lines through the
Book Load path (`createLoadWithFullSideEffects` / the insert at `book-load.service.ts`), line haul as a contracted total.
Required: every live load with an invoice has charge lines summing to that invoice's total.
**4. The 324 fuel JEs that credited 1090** ($145,337.20). Reverse through the existing engine; each fuel purchase becomes the
EXPENSE with the card as payment account (Relay 1295 · Dreamline 2510 · Amex 2500) — owner E22 ruling. No hand JE. Required:
0 live fuel postings crediting 1090; fuel dimension of parity unchanged at 110,072.33 / 171; TB balanced. This unblocks
`cursor/mint-zero-lh-invoice-c89b` — land it after.
**5. `verify-feed-is-whole` FAIL 1:** it rejects live `faro_invoice_number '1013272-2'` because its manifest lists that row as
"UNNUMBERED". `day_control.json` carries `1013272-2`. Make the guard read `day_control.json` `inv[]` as the authority. Exit 0 with 89/89.
**6. Self-carried invoices** (never Faro): 009 FLS · 010 Supply Chain Mgmt · 026 IM Specialized · 055/13555 2EMS (present, not
factored ✓) · 074/13593 Alligator (**no invoice live**). Each present, `factoring_status='not_factored'`, open, on its load.
Total **12,592.40**. Paste the five rows.

## GUARD — ONE, NAMED, IN THE FIRST PR
`scripts/verify-usmca-book-equals-faro-and-alwaystrack.mjs`: parity 34/34 · 89 advances each in `inv[]` once, NULL 0 · factored
open A/R = Faro AGING per invoice · 0 live loads from docs 5753/5760–5768 · 0 fuel postings crediting 1090 · every invoiced load has
charge lines = invoice total. Planted-RED per assertion. Wired in `money-pr-local-gate.mjs`.
## DONE LINE PER ITEM
`CC-1 | R-153.<n> DONE | <sha> | <live sha> | before X / after Y | parity 34/34 | unbalanced 0 | bank <count, unchanged by you>`
**Deadlines:** 1 → 09:00Z · 2 → 11:00Z · 3 → 12:30Z · 4 → 14:30Z · 5 → 15:00Z · 6 → 15:30Z. Missed → Cursor takes the item.
**You do not switch to any other work until item 6 is DONE.**
