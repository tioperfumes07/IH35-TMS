# ROUND 153.3 — CC-1 · CC-2 · CC-3 — FAST-MERGE 4-MINUTE LOOP, AND YOU COORDINATE EACH OTHER. NOT THE OWNER.
Claude Lead, 2026-09-25 3:22 AM CT (08:22Z). Owner: *"they must merge using the fast 4 minute weekend merge method. i need you all
coordinating automatically without me."* Law: `docs/bus/FAST-MERGE-4MIN-LAW.md` — FAST MERGE is ON.

## EVERY SHIP — THE 4–5 MINUTE LOOP, NO EXCEPTIONS
1 Gate `node scripts/money-pr-local-gate.mjs` → **exit 0** on your tip (tip contains origin/main).
2 Push. If it dies ONLY at `verify-static-fallback` ENV class (not your guard) → `git push --no-verify` is authorized.
3 `gh pr create`.
4 **Same 15 seconds:** `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`. Never
  `gh pr checks --watch`, never wait on CI, never ask the owner, never leave your PR open.
5 Neon proof for money/migrations. Backend deploy: one trigger after merge, then healthz `git_sha` = your squash sha.
6 One line in your NOW file: `<SEAT> | FAST-MERGE | gate=exit0 | merged #N @ <sha> | live=<healthz sha> | NEXT=<step>` → next step.
**You may NOT** merge on a gate FAIL, or `--no-verify` past your own red.

## THE ONE DEPENDENCY AND HOW YOU HAND IT OFF — WITHOUT THE LEAD, WITHOUT THE OWNER
CC-2 (match window) and CC-3 (LAW 5) both hold finished branches behind `verify-costs-are-expenses-not-handwritten-jes`, which is
**CC-1's ROUND 153.1 item 4**. The moment CC-1's item-4 PR is merged and the guard exits 0 live, **CC-1 runs, in the same turn:**
```
tmux send-keys -t cc2 "CC-1: costs guard GREEN at <sha>. FAST-MERGE your match-window branch now." && sleep 1 && tmux send-keys -t cc2 C-m
tmux send-keys -t cc3 "CC-1: costs guard GREEN at <sha>. FAST-MERGE your LAW 5 branch now." && sleep 1 && tmux send-keys -t cc3 C-m
```
and writes the same line at the top of `docs/bus/NOW-CC-2.md` and `NOW-CC-3.md`.
**CC-2 and CC-3:** while you wait, keep building your next steps on the same branch, and **re-check `origin/main` every 10 minutes**
(`git fetch && node scripts/verify-costs-are-expenses-not-handwritten-jes.mjs`). If it exits 0, merge — do not wait for a message.
**Any seat that finishes a step another seat needs** tells that seat the same way — tmux line + NOW-file line. Nobody routes through the owner.
**If you are rate-limited (429):** keep retrying; state it in your NOW file with the time. Silence past a deadline = surrender.

---

# ROUND 153.1 — CC-1 — ITEM 4 IS NEXT, AFTER THE ITEM YOU ARE ON. IT BLOCKS CC-3'S MERGE.
Claude Lead, 2026-09-25 3:10 AM CT (08:10Z). Same job, reordered inside it — not a switch.
CC-3's LAW 5 branch `39bf1632b1` (0 behind main, guard green) cannot merge: `verify-costs-are-expenses-not-handwritten-jes`
is red. Measured live 08:08Z, USMCA, the guard's own invariant 1 (5xxx/6xxx debit with no `accounting.expenses` row):
```
cost JEs 999 · without an expense row 539
  fuel_event                 207   <- REAL: fuel must be an EXPENSE with the card as payment account (owner E22)
  journal_entry               11   <- REAL: handwritten cost JEs — name each, void, re-create through the writer
  factoring_advance          134   <- guard is WRONG: factoring fee posts from its document through the factoring engine
  driver_settlement          101   <- guard is WRONG: driver pay posts from the settlement engine
  factoring_default_interest  86   <- guard is WRONG on the rule, BUT this is Faro default interest the owner has not approved
                                      (R-101.2). Put it on item 10's reconciliation with its Faro document or report it.
+ invariant 2: 324 fuel JEs credited 1090 ($145,337.20)
```
**Order now:** finish the item in flight → **item 4** → 2 → 3 → 5 → 6 → 7–11.
**Item 4, one PR:** (a) reverse the 207 fuel_event cost JEs + the 324 crediting 1090 through the existing engine and re-create each fuel
purchase as an EXPENSE with its card (1295 / 2510 / 2500); parity fuel stays 110,072.33 / 171. (b) void + re-create the 11 handwritten
`journal_entry` cost JEs through the right writer. (c) correct invariant 1 so a cost JE whose `source_transaction_type` is a document
engine (`factoring_advance`, `driver_settlement`, `factoring_default_interest`) AND whose `source_transaction_id` resolves to that live
document passes — no baseline, no exemption list of ids, planted-RED: an unresolvable source id still fails. Guard exit 0 live.
Then tell CC-3 in NOW-CC-3.md: "costs guard green at <sha>".
**Deadline 11:00Z (6:00 AM CT).** Missed → Cursor.

---

## ROUND 153 — UPDATED 2026-09-25 2:48 AM CT (07:48Z) — THE SCOPE IS THE WHOLE USMCA BOOK, NOT SIX ITEMS
Owner, verbatim: *"cc1 doesnt just need the reconcilaition it needs to feed and correct all the issues cursor created, feed all
data and make sure it is correct in correct chart of accounts, reconcile ap, ar, balance, asset accounts liability accounts, bills,
driver bills cash advance bill payments, expense, invoices line haul and other income categories, etc ... and of course many more
linkages are missing, driver, unit, trailer, load settlement etc."*
**Items 1–6 above stand and come first. Then 7–11. The job is done only when all eleven are proven. No switching.**
Measured live 07:46Z (bypass in-tx, USMCA):
```
loads 125 · no unit 27 · no driver 0 · no trailer 0 · no customer 0
expenses 385 · no load 0 · no unit 112 · no driver 66 · no trailer 305
fuel 441 live (parity counts 171 on the 34 documents — explain the other 270: import, duplicate or out-of-scope) · no unit 160 · no trailer 314
driver bills 124 · 19 not on a settlement · vendor bills 0 · BILL PAYMENTS 0
```
**7. Audit and correct everything the feed wrote** — every load, invoice, invoice line, driver bill, expense, fuel row, advance,
settlement and JE created since the purge, against its signed AlwaysTrack document and Faro row. Wrong → void and re-create
through the canonical writer. Never edit a posted row, never delete.
**8. Cash advances are BILL PAYMENTS** (closed law). Live bill payments = **0**. Every cash advance on every signed document becomes a
driver-bill payment dated when the money left, against that driver's bill for that document. Escrow → 2100 liability. Admin fee
and company-vehicle-use fee → INCOME. Paste the count per document = the document.
**9. Chart of accounts on every posting.** Line haul → 4000 · accessorials → 4200 / 4210 detention / 4220 layover / 4230 lumper /
4240 TONU · admin fee and vehicle-use fee → income · fuel/DEF/reefer as ITEMS → 5000 · lumper expense → 5310 · tolls 5300 ·
escrow 2100 · factoring per ASC 860 (A/R never derecognized) · cards 1295 / 2510 / 2500 · bank 1000. Paste account × source-type
totals; any posting on an account its item does not map to is a defect.
**10. Reconcile the ledger**, each to the cent, pasted: A/R 1100 = open invoice subledger = Faro AGING for factored + open
self-carried · A/P 2000 = open bills · driver payables = open driver bills · 2100 escrow = document escrow · Faro reserve /
advances = Faro RESERVE REPORT and FUNDS DUE · 1090 holds only undeposited receipts · 1000 = the bank register · trial balance
balanced · balance sheet balances (assets = liabilities + equity) · P&L revenue = parity line haul + accessorials + other income.
**11. Linkage on every record, both ways** — load ↔ driver ↔ unit ↔ trailer ↔ customer ↔ settlement; expense/fuel ↔ load ↔ unit
↔ driver ↔ trailer ↔ vendor ↔ card; driver bill ↔ load ↔ settlement ↔ bill payment; invoice ↔ load ↔ Faro advance ↔ receipt.
Source is the signed document (`Trk:` / `Trlr:` per stop), never a guess. Required after: every count above in the "no …" columns = 0,
or the row names the document that genuinely has no value.
**Guard** `verify-usmca-book-equals-faro-and-alwaystrack.mjs` gains an assertion per item 7–11. Planted-RED each.
**Deadlines:** 7 → 18:00Z · 8 → 20:00Z · 9 → 21:00Z · 10 → 23:00Z · 11 → 2026-09-26 02:00Z. Missed → Cursor takes the item.

---

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

---

# NOW-CC-1 — 2026-09-24 05:15 UTC
## CURRENT (Round 152.1)
Serve the day gate. Settlement lands per document as Cursor closes purchase days.
Fuel posting / expenses posting / 1090→1000 remain CC-1 money lane.
Do not run the Faro day feed (Cursor owns it).
