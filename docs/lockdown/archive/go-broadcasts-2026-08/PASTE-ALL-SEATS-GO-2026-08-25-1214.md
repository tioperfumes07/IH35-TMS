# PASTE ALL SEATS — GO 2026-08-25 12:14 CT

**Idle = defect.** Hard-reload **USMCA**. Live API `healthz/shallow` **`fb925ef`**. SPA autoDeploy is on `ih35-tms-web` — hard-reload `app.ih35dispatch.com` (Cmd-Shift-R). **Nobody `trigger_deploy`.** U14 never restamp.

Same 30 items as GO-1139. **Not a 15th plan.** CC-1/CC-2/CC-3 were **429 rate-limited** (not HOLD). After retry succeeds: `git pull --ff-only origin main` → INBOX TOP → work YOUR numbers. **CC-1:** do not occupy Cursor lead worktree `IH35-TMS-clean` — use your money clone, `main`. Codex: not attached — attach and GO.

**Owner view now:** Accounting → + Create bill / Record expense (Bill no. / Ref no. top-right, #15764). Recurring bill: postable CoA + Template name right (#15795, live).

Reuse load `065538c8-…` (`L-20260824-0007`), customer `55baee26-…`, T-LIVE `1a3c98da-…`, WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`, parts `45f36791-…`. Do **not** remake Complete cards / Close / `/425c` loop / BILL-2026-00015 header / parts receive.

**Do not remake (already Complete):** hops 1, 3–8 · customer · driver_onboarding · coa · advance · escrow · ap · fuel · legal · factoring · banking · breakdown_relay · trailer_swap · parts_receive.

---

## 30 numbered NOW items (work until each is Complete or FINDING filed)

### CC-1 · 9223 · money serial (one at a time — reuse poster, no new GL math)

1. **FIX** `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` — live invoice still `INV-2026-00044`, must equal `L-20260824-0007`
2. **FIX** `CASHFLOW-PROFORMA-PROJECTED-LABELED` — `/cash-flow` shows proforma as Projected / Pre-invoice by delivery date
3. **FIX** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` — expense `57cabbab-…` status=posted / posting_status=**unposted**
4. **FIX** `hop.bank` probe honesty — Program still `matched_invoice_id` 0 while Neon has recon + `matched_transfer_id`
5. **FIX** `scenario.roadside_ap` JE on existing WO bill (TMS-native; QBO clones do not count)
6. **FIX** `WO-AUTO-BILL-NEVER-POSTS-GL-JE` + stamp `accounting.bills.vendor_id` on autoCreateBillFromWO (probe join)
7. **FIX** `LV-PAY-SETTLE-NOPOST` / **`scenario.settlement`** — paid settlement + posted pay-run JE
8. **FIX** `HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS` — mint from **driver rate card × shortest miles**, never customer rate (`BLOCKS=hop.assign`)
9. **SCENARIO** Print letters: invoice `/api/v1/accounting/invoices/:id.html` · bill `:id.html` · expense print — wrapPdfDocument, not SPA
10. **SCENARIO** After official invoice: vendor **bill payment** match on the roadside bill; factoring only on official invoice not proforma

Never `/425c`. Never remake advances. Never `trigger_deploy`.

### CC-2 · 9224 · prove same TESTs + unique leftover

11. **SCENARIO** After #1–2 merge: prove `/cash-flow` Projected/Pre-invoice + load number on the line
12. **SCENARIO** Print A/R aging, A/P aging, P&L, BS, TB — **same TEST dollars**, never fake $0
13. **SCENARIO** Print `/cash-flow` + `/finance` statement package (letter HTML)
14. **SCENARIO** Profit-per-truck / customer profitability — T-LIVE vs T-DEAD must not double-count load `065538c8-…`
15. **FIX** Unique leftover **500 / dead click / silent no-op** on `/reports` or `/tasks` (one PR)
16. **SCENARIO** Form 425C **print format only** (court form, not SPA) — **do not loop leftover `/425c` certify**

Never remake hop 9 Chrome. Never Close remake.

### CC-3 · 9225 · maintenance chrome + leftover

17. **SCENARIO** `scenario.maintenance` — transition WO `850e2cc4-…` to **`complete`** (enum has no `closed`; #15767 probe fix is live). Card Completes only after CC-1 JE (#6)
18. **SCENARIO** WO print letter `/api/v1/work-orders/:id/pdf` — `PDF_BASE_STYLES`, not SPA chrome
19. **FIX** `DOCS-F6072-UPLOAD-ENTITY-VALIDATION-CROSS-COMPANY`
20. **SCENARIO** Property allocation / TX BPP rendition print if control exists; else unique FINDING for missing print
21. **FIX** Unique leftover lists or legal **500 / dead / silent**
22. **FIX** If still red on main: `MAIN-ACCOUNTING-SORTABLE-HEADERS-BILLSPAGE-ID-BREAK` (Bills `id` column sortable)

Do not remake parts `45f36791`. Do not remake legal Complete. Never `trigger_deploy`.

### Codex · 9226 · ops FE (do not steal CC-1 money)

23. **SCENARIO** `hop.assign` — prove live assignment on load `065538c8-…`; driver-bill **mint is CC-1 #8**. File FINDING if UI silent; do not invent wages
24. **SCENARIO** `scenario.deductions` — itemized obligation on D1; skip if no real deductible
25. **SCENARIO** Dispatch-sheet print after relay — sheet shows **T-LIVE**, not T-DEAD
26. **FIX** `SETL-EVIDENCE-UPLOAD-SILENT-DROP` if still true on settlement evidence upload
27. **SCENARIO** `scenario.accident` + `scenario.insurance` — **only with a real accident/claim**. Do **not** fake. If none: OUTBOX `SKIP-NO-REAL-ACCIDENT`, next unique safety leftover

Never remake breakdown_relay / trailer_swap / fuel Complete. Never restamp U14. Never `trigger_deploy`.

### Cascade · audit

28. **SCENARIO** Re-walk `/program` USMCA all 28 cards on SHA `fb925ef`. FINDING if Complete is false-green (no UUID/JE). No product PR. No U14 restamp.

### Devin-A · audit

29. **SCENARIO** `hop.book` + `scenario.customer` (already Complete). FINDING if Book Load silent. Click Create bill — confirm **Bill no.** top-right live. Not PARKED. No U14 restamp.

### Cursor · 9222 · lead

30. **Lead** unique leftover 500/dead. PCMILER/geofence **owner-gated**. Do not steal #1–10. Do not second-kick deploy.

---

## Matrix (every fixer after their hop)

| Seat | `/program/matrix?module=` |
|------|---------------------------|
| Cursor | `dispatch` `customers` |
| CC-1 | `accounting` `banking` `factoring` |
| CC-2 | `reports` |
| CC-3 | `lists` `legal` |
| Codex | `drivers` `fleet` `safety` `fuel` |

---

OUTBOX:

```
SEAT | ACK | GO-1214 | PORT=n | SHA=fb925ef | ITEM=<1-30> | KEY=<card-or-finding> | TABLE=<schema.table> | UUID=<id> | JE=<id-or-none> | FINDING=<id-or-none> | GO
```
