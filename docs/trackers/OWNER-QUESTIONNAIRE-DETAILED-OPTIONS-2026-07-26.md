# OWNER QUESTIONNAIRE — Detailed options + recommendations
**Date:** 2026-07-26  
**How to answer:** Reply `A1: A`, `A3: B+C`, etc. One sitting. We lock into law after.

**Standards used for recommendations:** QuickBooks / NetSuite controls · McLeod / Alvys TMS · your CPA ANSWERS.docx · already-locked IH35 rulings.

**Already locked — skip:** factoring = secured borrowing · escrow = current liability · advances = asset · 5% floor + override · Cost of Labor–Mexico Drivers · A/R QBO-45 · A/P QBO-47 · cash_dip = WF 6103 · USMCA live · WO void = whole bill · LST-F17 = per-entity catalogs · LINK-02 = WIRE · flags = LATER · ACCT-DOM-01 JE roles · TONU presentation under Accessorial · reserves = owner-manual.

---

# SECTION A — Active money blocks (answer first)

## A1 — BANK-DOM-04: When does an aged reconciling item escalate?

**Context:** Unmatched / uncleared bank items sit in review. Escalation = alert Owner/Admin/Accountant + show on aged recon dashboard (not auto-post).

| Option | Meaning |
|--------|---------|
| **A** | Escalate at **30+ days** |
| **B** | Escalate at **60+ days** |
| **C** | Escalate at **90+ days** |
| **D** | Two tiers: warn at 30, escalate at 90 |
| **E** | Other (write days): ___ |

**Recommendation: D** — warn at 30 (ops cleanup), hard escalate at 90 (matches typical bank/auditor aging buckets; QBO-style “old transactions” discipline without daily noise).

**Your answer:** ___

---

## A2 — BANK-DOM-05: Intercompany Due-to / Due-from accounts

**Context:** When money moves TRANSP ↔ USMCA (or TRK), books need matching asset (Due from) + liability (Due to). Entities stay separate; balances must mirror.

| Option | Meaning |
|--------|---------|
| **A** | Bind **existing** intercompany receivable / payable CoA rows per entity; Cursor prepares Neon designate SQL; you say apply |
| **B** | Create **new** CoA accounts named `Due from [Entity]` / `Due to [Entity]` for each pair; then designate |
| **C** | Use one shared “Intercompany Clearing” account per entity (simpler, less drill-down) |
| **D** | Other (name exact QBO account names): ___ |

**Recommendation: A** — matches your CPA rule (loan/sale between companies = asset one side, liability other; mirror balances). Avoid inventing new GL unless rows missing. NetSuite/QBO both use designated IC AR/AP, not a mystery clearing dump.

**Your answer:** ___  
**If A/B:** Confirm entities in scope now = TRANSP↔USMCA only, or also TRK? ___

---

## A3 — BANK-DOM-06: What is fuel “card overage” → driver liability?

**Status 2026-07-26:** Mechanism **built** on [PR #3602](https://github.com/tioperfumes07/IH35-TMS/pull/3602) — `fuel.fuel_card_overage_policies.per_transaction_limit_cents` + optional `recover_non_fuel_purchases`; flag OFF; Neon not applied. Remaining = **your limit numbers + APPLY + flag**.

**Context:** Diesel GL posting path exists; this question is **what amount becomes a driver deduction / receivable**, not whether diesel expense posts.

| Option | Meaning |
|--------|---------|
| **A** | Amount **over the driver’s weekly (or trip) card spend limit** |
| **B** | **Unauthorized fuel type** (e.g. DEF / unleaded / reefer fuel when policy forbids) at full txn amount |
| **C** | **Gallons over policy** (e.g. over tank fill rule) × unit price |
| **D** | **Personal / off-route** fuel (flagged by location or manager) |
| **E** | Combination: **A + B + D** (limit breach + bad product + personal) |
| **F** | Manual only — ops creates liability; system never auto-seeds from card rules |
| **G** | Other: ___ |

**Recommendation: E** — McLeod/Alvys-style: auto-seed candidate liability for limit + product + personal flags; **manager confirms** before settlement deduct (protects drivers; protects company). Not F (too easy to miss money).

**Sub-questions (if not F):**

| ID | Question | Options | Rec |
|----|----------|---------|-----|
| A3b | Auto-post to settlement on seed, or require confirm? | **1** auto · **2** confirm first | **2** |
| A3c | GL for driver liability | **1** Driver Cash Advance asset · **2** new Driver Fuel Overage receivable · **3** deduct escrow first | **2** (keep advances clean) |
| A3d | If driver can’t pay | **1** escrow then pay then Damage Loss · **2** hold forever · **3** write-off immediately | **1** (matches your CPA separation example) |

**Your answers:** A3 ___ · A3b ___ · A3c ___ · A3d ___

---

## A4 — MNT-ECON-02: Severe repair capitalize vs expense

**Locked already:** Always ask capitalize vs expense **per event** — no $ threshold.

### A4-D1 — Capitalize posts to which CoA role?

| Option | Meaning |
|--------|---------|
| **A** | Existing role `fixed_asset_trucks` (truck/unit asset) |
| **B** | New role `severe_repair_capitalized` (separate asset bucket) |
| **C** | Parent fixed asset + sub-account per unit (owner creates accounts) |

**Recommendation: A** for MVP (QBO/NetSuite: improvements that extend life go to the asset; avoid role sprawl). **C** later if you want per-unit FA sub-ledgers.

**Your answer:** ___

### A4-D2 — Expense posts to which role?

| Option | Meaning |
|--------|---------|
| **A** | New `maintenance_severe_repair_expense` |
| **B** | Reuse `maintenance_parts_expense` / shop repairs expense |
| **C** | Split: parts → parts expense; labor → shop labor expense |

**Recommendation: A** — severe repairs are material and need P&L visibility separate from routine parts (McLeod maintenance seriousness + CPA reporting).

**Your answer:** ___

### A4-D3 — Bill vs cash when already paid?

| Option | Meaning |
|--------|---------|
| **A** | **Always** create A/P bill + JE (then bill payment when paid) — your CPA “if not paid same day = bill” |
| **B** | If already paid (card/cash): **cash/expense JE only** (no bill) |
| **C** | **Hybrid:** unpaid → bill+JE; already paid → bank categorize / expense JE linked to WO |

**Recommendation: C** — matches your CPA ANSWERS (bill if unpaid; fuel/card-style paid immediately = expense/bank; mail collection paid later = expense with link). Same pattern for severe repair.

**Your answer:** ___

### A4-D4 — Capitalize creates fixed-asset register row?

| Option | Meaning |
|--------|---------|
| **A** | **JE-only MVP** — register row in a later FA block |
| **B** | Create FA register row **now** on capitalize |
| **C** | FA register only if cost ≥ amount you name: $___ |

**Recommendation: A** — don’t block severe-repair GL on full FA module; TRK already owns 5-yr SL depreciation policy.

**Your answer:** ___

### A4-D5 — Approve estimate without linked Work Order?

| Option | Meaning |
|--------|---------|
| **A** | **Require WO** always |
| **B** | Allow without WO (orphan estimate) |
| **C** | Allow without WO only for Owner/Admin; others require WO |

**Recommendation: A** — Law of the Land linkage (repair → unit + vendor + WO + expense/asset + JE). Orphans fail audits.

**Your answer:** ___

---

## A5 — Escrow liability role Neon seed

| Option | Meaning |
|--------|---------|
| **A** | Yes — Cursor prepares designate SQL for `escrow_liability` (or locked name) per entity; you say **apply once** |
| **B** | You will create/name the QBO/CoA accounts first, then Cursor designates |
| **C** | Defer seed until after next QBO cleanup |

**Recommendation: A** if accounts already exist under Driver Escrow; **B** if you still need to create the liability accounts in CoA.

**Your answer:** ___

---

# SECTION B — Invoice / TONU / revenue build GO

## B1 — Build TONU / billable cancellation → A/R?

**Context:** Presentation locked (Accessorial / TONU child). Design HOLD also said fee is **operator-decided**, not auto on every cancel.

| Option | Meaning |
|--------|---------|
| **A** | **GO** — build path; operator must click **Bill TONU** (manual trigger); posts to TONU accessorial + A/R |
| **B** | **GO** — auto-invoice TONU whenever cancel reason is billable |
| **C** | **NO-GO** — keep paper/QBO only for now |
| **D** | GO for TRANSP only; USMCA later |

**Recommendation: A** — matches your HOLD design + McLeod (dispatcher decides fee) + closes AR-leak when you *do* bill. Avoid B (wrong fees, customer fights).

**Sub:** If A/B — require Owner/Admin approval before send? **1** Yes · **2** No (dispatcher enough)  
**Rec: 2** for speed; Owner can void.

**Your answers:** B1 ___ · approval ___

---

## B2 — Auto-invoice / Unbilled Revenue model?

**Context:** You said: invoice created on pickup day; revenue when invoice created; closes on deliver. Design also has two-event Unbilled Revenue model.

| Option | Meaning |
|--------|---------|
| **A** | **GO two-event:** Book → DR Unbilled / CR income; Deliver/POD → DR A/R / CR Unbilled (seed Unbilled Revenue TRANSP+USMCA) |
| **B** | **GO single-event:** Create invoice at pickup → DR A/R / CR income immediately (no Unbilled account) |
| **C** | **GO hybrid:** draft/pre-invoice at book (no GL); official invoice + A/R at deliver/POD |
| **D** | **NO-GO** — keep manual invoice create only |

**Recommendation: C** for ops honesty (don’t recognize A/R before deliver) **or A** if you want full ASC 606 unbilled asset. Your “revenue when invoice created” fits **B or C** depending when the official invoice exists. Prefer **C** to avoid booking A/R on loads that never deliver.

**Your answer:** ___

---

## B3 — Unmapped invoice line (no product/service → CoA)?

| Option | Meaning |
|--------|---------|
| **A** | **Hard-fail** — cannot save invoice until mapped |
| **B** | Post to **Uncategorized Income**; require daily cleanup queue |
| **C** | Hard-fail in production; Uncategorized allowed only for Owner/Admin with reason |

**Recommendation: C** — your CPA said uncategorized + daily cleanup is ok while fixing products, but production money should not silently dump. Owner override keeps ops moving.

**Your answer:** ___

---

# SECTION C — Settlements / escrow / factoring

## C1 — Separation: cash advance vs escrow

**Context:** CPA pack example: $3k damage, $500 escrow, $1500 pay → take escrow + pay, loss $1000 to Drivers Damage Loss.

| Option | Meaning |
|--------|---------|
| **A** | Confirm that ordering: escrow → net pay → Damage Loss for shortfall (override 5% floor for Owner/Admin/Accountant) |
| **B** | Never touch escrow for cash advances; only for damage/escrow types |
| **C** | Cash advances recover from future settlements only; escrow never offsets advances |

**Recommendation: A** — exactly your written CPA example; floor override already locked.

**Your answer:** ___

---

## C2 — Which deduction types may draw escrow?

| Option | Meaning |
|--------|---------|
| **A** | **Only** `escrow_load_abandonment` (current) |
| **B** | Abandonment + **damage claims** |
| **C** | Abandonment + damage + **safety fines** |
| **D** | Abandonment + damage + safety + **factoring chargebacks** billbacked to driver |
| **E** | Any deduction_type flagged `may_draw_escrow=true` in catalog (you control list in UI) |

**Recommendation: E** — catalog-driven (matches “policies in catalogs”); seed B+C defaults; chargebacks opt-in later.

**Your answer:** ___

---

## C3 — Must Faro exist as mdata.vendors row?

| Option | Meaning |
|--------|---------|
| **A** | **No** — `factoring.factor` + customer NOA is enough |
| **B** | **Yes** — Faro must also be a vendor for A/P / fee bills |
| **C** | Yes for fee/chargeback bills only; funding stays on factoring.factor |

**Recommendation: C** — McLeod/Alvys: factor is a financing counterparty; vendor row only when you owe them fees/chargebacks as A/P.

**Your answer:** ___

---

## C4 — Faro debtor credit-check UI in TMS?

| Option | Meaning |
|--------|---------|
| **A** | **Out** — leave in Faro portal / daily report files |
| **B** | **In** — read-only surface of daily report credit flags |
| **C** | **In** — block dispatch/factoring submit when credit fail |

**Recommendation: A** now (don’t build credit bureau inside TMS); **B** later if Faro feed is stable.

**Your answer:** ___

---

## C5 — Customer chargeback → driver billback policy

| Option | Meaning |
|--------|---------|
| **A** | Only **driver-caused** (cargo claim, detention driver fault, equipment damage) with Safety/Owner approve → driver bill + Drivers Damage Loss / expense path |
| **B** | All customer chargebacks auto bill to driver |
| **C** | Never bill driver; company absorbs; track as Factoring Recoursed only |
| **D** | A, but GL = reduce original expense / other income (not A/R to driver) |

**Recommendation: A** — matches CPA “Factoring Recoursed” + separate driver damage path; never B (unfair / legal risk).

**Your answer:** ___

---

# SECTION D — Maintenance / safety / parts GL

## D1 — Safety costs / fines → which expense?

| Option | Meaning |
|--------|---------|
| **A** | Single account **Safety Fines & Penalties** (you create; we designate role) |
| **B** | Split: **DOT/FMCSA fines** vs **Internal safety charges** |
| **C** | Reuse general **Legal & Professional** / miscellaneous expense |
| **D** | You will paste exact CoA names after Excel export |

**Recommendation: B** — auditor/FMCSA clarity; internal charges ≠ government fines.

**Your answer:** ___

---

## D2 — Parts inventory GL

| Option | Meaning |
|--------|---------|
| **A** | Receipt → DR Inventory asset; WO consume → DR expense / CR Inventory (full perpetual) |
| **B** | Expense parts on receipt (no inventory asset) — shop supplies style |
| **C** | Inventory only for tires/high-value; other parts expense on receipt |

**Recommendation: C** for trucking reality (tires/high-value tracked; consumables expensed) — common McLeod/shop practice.

**Your answer:** ___

---

## D3 — WO cancel reasons catalog

| Option | Meaning |
|--------|---------|
| **A** | Fold into one `void_cancel_reasons` catalog (WO uses same) |
| **B** | Keep `wo_cancellation_reasons` separate |
| **C** | One catalog with `applies_to` flags (load / WO / bill / …) |

**Recommendation: C** — one catalog shape, filtered by document type (matches LST-F17 per-entity pattern).

**Your answer:** ___

---

## D4 — Accessorial revenue engine (code divergence)

| Option | Meaning |
|--------|---------|
| **A** | Cursor researches live paths, proposes one canonical engine; you approve in one line |
| **B** | You name canonical files now: ___ |
| **C** | Defer until after TONU/invoice GO (B1/B2) |

**Recommendation: A** then **C** order — don’t pick files blind; lock after B1/B2.

**Your answer:** ___

---

# SECTION E — Tax / compliance / DIP / close

## E1 — Mexican B1 drivers tax reporting

> **ANSWERED 2026-07-26 — OWNER-DECISIONS-FINAL E1 (do not fill the blanks below).** No withholding from anyone (Mexico B1/B2 drivers, Mexican mechanics, all). W-8BEN on driver file AND in Legal. **No 1042-S/1099.** There is no CPA. The option table is historical questionnaire chrome.

| Option | Meaning |
|--------|---------|
| **A** | **W-8BEN on file + 1042-S**; withhold **30%** NRA unless treaty exception documented |
| **B** | **W-8BEN + 1042-S**; **0% withholding** for now (treaty/ops); document risk |
| **C** | Treat as **1099-NEC** only (not recommended for foreign persons) |
| **D** | Counsel decides; build form storage only (W-8BEN in driver file) until memo |

**Recommendation: D** short-term (you already required W-8BEN in driver file yearly) + **do not invent 30% code** until counsel/CPA memo. Wrong withholding = company risk.

**Your answer:** ___  
**Is 30% being withheld today in payroll/ops?** Yes / No / Don’t know: ___

---

## E2 — Safety events auto-change driver status?

| Option | Meaning |
|--------|---------|
| **A** | **No auto** — Safety/Owner sets probation/suspension manually (termination path already exists) |
| **B** | Auto by severity thresholds you define: ___ |
| **C** | Auto **suggest** status change; human confirms |

**Recommendation: C** — FMCSA/DQ seriousness without silent career-ending automation.

**Your answer:** ___

---

## E3 — Hire / contract state machine before build?

| Option | Meaning |
|--------|---------|
| **A** | **Approve** — build pending contract upload/sign states in hiring wizard |
| **B** | **Defer** — keep current hire flow; contracts as documents only |
| **C** | Approve design doc only; build next quarter |

**Recommendation: A** — you asked for contracts in safety create wizard with W-8BEN etc.

**Your answer:** ___

---

## E4 — OSHA workplace incidents module?

| Option | Meaning |
|--------|---------|
| **A** | **Out of scope** for TMS (HR/OSHA binder outside) |
| **B** | **In** — build `hr.osha_incidents` surfaces |
| **C** | In later; after Safety core gaps closed |

**Recommendation: C** — trucking priority is DOT/FMCSA first; OSHA is real but second wave.

**Your answer:** ___

---

## E5 — Customs HTS / tariff classification?

| Option | Meaning |
|--------|---------|
| **A** | **Out** — broker/customs handles; border module enough |
| **B** | **In** — HTS codes on load/commodity |
| **C** | Store broker-provided HTS read-only; no classifier engine |

**Recommendation: A or C** — don’t build a customs broker inside TMS.

**Your answer:** ___

---

## E6 — DIP MOR: pre- vs post-petition A/P split?

| Option | Meaning |
|--------|---------|
| **A** | **Yes** — tag bills with petition date; MOR columns split |
| **B** | **No** — court auth + separate DIP cash is enough for now |
| **C** | Yes for reports only (no GL change) |

**Recommendation: C** — UST/MOR usefulness without rewriting A/P GL; petition date on vendor bills.

**Your answer:** ___

---

## E7 — Month-close lock rule

| Option | Meaning |
|--------|---------|
| **A** | Lock on **Owner/Admin/Accountant acknowledged checklist** (overdue A/R–A/P allowed with listed exceptions) |
| **B** | Lock only if **zero** overdue A/R–A/P (current unsatisfiable path) |
| **C** | Soft close anytime; hard close only after checklist + second user (aligns JE SoD alert model) |

**Recommendation: C** — matches your period-close CPA answer (alert approver; reject → void) and NetSuite-style soft/hard close.

**Your answer:** ___

---

## E8 — Year-end / retained earnings

| Option | Meaning |
|--------|---------|
| **A** | CPA memo first; no code until memo |
| **B** | Automated year-end roll OBE→RE per locked cutover rules; Owner runs ceremony |
| **C** | Manual JE only in QBO; TMS reports only |

**Recommendation: A then B** — don’t invent ASC close without CPA; OBE→RE already partially locked.

**Your answer:** ___

---

# SECTION F — Product scope (In / Out / Later)

For each: **A** = In now · **B** = Later · **C** = Permanently out

| ID | Topic | Rec | Your answer |
|----|-------|-----|-------------|
| F1 | Lending / bank-risk analytics module | **C** (not a bank) | |
| F2 | Process-bottleneck / audit-docs workflow dashboard | **B** | |
| F3 | Equipment calibration (ELD/scale) in TMS | **B** | |
| F4 | Document-control approval lifecycle on docs.files | **C** (git + files enough) | |
| F5 | Commodity → equipment mapping (reefer etc.) | **B** | |
| F6 | Commodity rate matrix | **B** (needs F5) | |
| F11 | Encryption key rotation / KMS | **B** (current key OK short-term) | |
| F16 | Factoring required-docs matrix per entity type | **A** (define matrix next message) | |

### F7 — Form 425C Exhibit C opening-balance scope

| Option | Meaning |
|--------|---------|
| **A** | Cash + A/R + A/P + escrow liability + factoring reserve asset only |
| **B** | Full BS lines matching UST form for TRANSP |
| **C** | Re-derive from live QBO TB at petition/cutover; you approve spreadsheet |

**Recommendation: C** then implement A as minimum filing set.

**Your answer:** ___

### F8 — Notifications module “not fully audited”

| Option | Meaning |
|--------|---------|
| **A** | Full surface inventory + delivery proof (email/SMS/in-app) for Owner high-risk alerts only |
| **B** | Entire notifications product redesign |
| **C** | Mark STALE — no special project; fold into WF-064 Owner notify |

**Recommendation: C** unless you have a named broken alert.

**Your answer:** ___

### F9 — Retention / critical truncate

| Option | Meaning |
|--------|---------|
| **A** | Never truncate: audit, JE, bank txn, settlements, invoices, bills |
| **B** | Follow written retention schedule (years): ___ |
| **C** | Re-investigate which job truncates; propose fix without new policy |

**Recommendation: A + C** — permanent records law; find the bad job.

**Your answer:** ___

### F10 — IDVR row/session issue

| Option | Meaning |
|--------|---------|
| **A** | Re-investigate live with owner login; don’t ask more until defect is named |
| **B** | You describe the screen/bug now: ___ |

**Recommendation: A**

**Your answer:** ___

### F12 — Canonical schema names (remaining dups)

| Option | Meaning |
|--------|---------|
| **A** | Lock: `documents` · `mdata` · `maintenance` (archive others — never delete data) |
| **B** | Lock differently: ___ |
| **C** | Defer; finish money modules first |

**Recommendation: A** (already consistent with §9.6 direction) or **C** if conflict risk is high this week.

**Your answer:** ___

### F13 — JE segregation of duties enforcement

| Option | Meaning |
|--------|---------|
| **A** | **App-layer only** (ACCT-DOM-01 roles) — enough |
| **B** | App + **DB trigger** `approved_by ≠ posted_by` |
| **C** | DB trigger only for amounts over $___ |

**Recommendation: A** now (you locked role model); **B** later if auditors demand.

**Your answer:** ___

### F14 — Resizable tables

| Option | Meaning |
|--------|---------|
| **A** | **Keep** resize feature (shipped) |
| **B** | Retire resize app-wide |
| **C** | Keep on grid modules only (dispatch/accounting lists) |

**Recommendation: A** — don’t rip working UX.

**Your answer:** ___

### F15 — Finance landing + tabs

| Option | Meaning |
|--------|---------|
| **A** | `/finance` → **Hub**; unify to design tab count |
| **B** | Keep **Overview** landing; Hub is secondary |
| **C** | Cursor audits arch-design tab count and proposes one PR — you approve |

**Recommendation: C** then A/B — Rule 05: design wins; don’t guess tab count.

**Your answer:** ___

---

# SECTION G — Palette exceptions

## G1 — “Open queue” CTA green?

| Option | Meaning |
|--------|---------|
| **A** | **No** — keep navy `#1F2A44` (locked) |
| **B** | **Yes** — one-time §7 exception for this CTA only |
| **C** | Yes for all “attention” CTAs (broader exception) |

**Recommendation: A** — palette thrash creates drift.

**Your answer:** ___

## G2 — “+ Log Event” CTA green?

Same options A/B/C as G1. **Recommendation: A**

**Your answer:** ___

---

# SECTION H — Ops timing / Neon hands

## H1 — When flip QBO projection / posting flags ON?

| Option | Meaning |
|--------|---------|
| **A** | Keep **OFF / LATER** until you say volume-ready (current ruling) |
| **B** | Flip specific flags now — list: ___ |
| **C** | Flip after next 7-day recon green streak |

**Recommendation: A**

**Your answer:** ___

## H2 — Neon apply authority for designate seeds

| Option | Meaning |
|--------|---------|
| **A** | Standing order: Cursor **prepare + apply** designate SQL when you reply **APPLY** on a named packet |
| **B** | Cursor prepares only; you always paste/run |
| **C** | Claude prepares; Cursor applies |

**Recommendation: A** — matches your “I’m not a coder” standing order.

**Your answer:** ___

---

# Answer sheet (copy/paste back)

```
A1:
A2:   entities:
A3:   A3b:   A3c:   A3d:
A4-D1:
A4-D2:
A4-D3:
A4-D4:
A4-D5:
A5:
B1:   approval:
B2:
B3:
C1:
C2:
C3:
C4:
C5:
D1:
D2:
D3:
D4:
E1:   withhold today:
E2:
E3:
E4:
E5:
E6:
E7:
E8:
F1:
F2:
F3:
F4:
F5:
F6:
F7:
F8:
F9:
F10:
F11:
F12:
F13:
F14:
F15:
F16:
G1:
G2:
H1:
H2:
```

If you want the **fast path**, answer only: **A1–A5, B1–B3, C1–C2, H1–H2** first — those unblock money builds this week. The rest can be a second sitting.
