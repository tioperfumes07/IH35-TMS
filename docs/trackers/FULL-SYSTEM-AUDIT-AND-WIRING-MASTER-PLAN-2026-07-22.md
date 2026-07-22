# FULL SYSTEM — AUDIT & WIRING MASTER PLAN (2026-07-22)

**Owner purpose:** permanent checklist so Jorge can remind Cursor later, and Cursor cannot “forget” the bar.  
**Standing law:** Rule 21 (`.cursor/rules/21-full-system-no-partial-amnesia.mdc`) + Law §9 (`ARCHITECTURE-BLUEPRINT-2026-07-05.md`) + owner word 2026-07-21 (OS of record).  
**How to remind Cursor:** paste this path — `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` — and say **“execute the master plan.”**

---

## 0. What “done” means (never redefine)

For **every module · every tab · every nested tab · every wizard/creator/drawer**:

| Layer | Required |
|-------|----------|
| **A. Active path** | Operators see the **NEW** design (no `DUAL_PATH_OLD_ACTIVE`; no ComingSoon while Live exists) |
| **B. Wizard depth** | Field-by-field: chrome, pickers, bank/accounts, ops FKs, recovery/posting modes — not a thin form |
| **C. Law §9 linkage** | Counterparty + GL/CoA + audit + load/driver/unit/WO/claim/legal as applicable; **forward + reverse** drill |
| **D. Purpose → economics** | Purpose/type of the transaction decides **what money object is created** (settlement deduct vs expense vs bill vs escrow…) |
| **E. Evidence** | Live proof or honest **UNVERIFIED**; CI-green ≠ done |

Chrome-only / nested-+Create-only / docs-only **never** closes a module.

---

## 0.1 Owner binding examples (depth you already showed — do not dilute)

These are **canonical depth samples**. Every other module/tab/wizard must be audited and wired to **this same seriousness**. When Cursor “forgets,” re-read this section first.

### Example A — Insurance / claim / lawsuit (Law §9 + reverse drill)

**What you meant:** Insurance is not a isolated form. A claim/lawsuit must carry **driver + unit (+ load/accident)** and drill **both ways**.

| Surface | Required linkage | Wrong / incomplete | Right |
|---------|------------------|--------------------|------|
| `ClaimCreateModal` | Driver, unit/asset, load, accident report | Bare `<select>` with no +Create; no reverse on DriverDetail | `DriverPickerWithCreate` + unit create; claim appears on driver/unit/load; lawsuit ↔ legal matter EntityLink |
| Lawsuit ↔ Legal matter | Forward + reverse | Matter page dead-ends; lawsuit has no matter hop | [#3221](https://github.com/tioperfumes07/IH35-TMS/pull/3221) class work |
| Schema traps | FK/pointers enforced | Guard hid `insurance.lawsuit` driver/unit breaks (#3169 class) | Pointers enforced; 0-count re-check with RLS bypass |

**Done only when:** create → row → GL/expense if money → driver profile reverse → unit reverse → load reverse → legal matter reverse (as applicable) — proven live or UNVERIFIED named.

### Example B — Safety / accident (dual-path + active design)

**What you meant:** You changed Safety design; operators still hit old format / ComingSoon while the real tab exists elsewhere.

| Kind | Evidence (your example class) | Fix class |
|------|------------------------------|-----------|
| LIVE | `SafetyLayout` + V6.4 tabs (`SafetyHomeTab`, AccidentsIncidents, Fines…) via `manifest` | Keep |
| OLD still in tree | Deprecated `SafetyHome.tsx`; parallel `AccidentsPage` / `FinesPage` beside tab versions | Archive; never preferred mount |
| Stub while Live exists | `/safety/fines-and-discipline` → ComingSoon while fines tabs exist | Redirect to Live (#3183 pattern) — **already fixed**; same class elsewhere must not return |
| Accident create | `AccidentReportDrawer` money/claim fields must **persist** + link claim/driver/unit/load | SAFETY-ACCIDENT-PERSIST + ClaimCreate depth |

**OLD vs NEW audit rule (every module):** table must show OLD look/behavior · NEW look/behavior · **what operators see TODAY** (`DUAL-PATH-OLD-VS-NEW-DESIGN-AUDIT-2026-07-22.md`).

### Example C — Create Cash Advance wizard (your 2026-07-22 walkthrough)

**What you meant opening the wizard:** current design **cannot** express real linkage or purpose→money.

| You said | Required |
|----------|----------|
| Boxes within boxes | Flatten chrome — no nested bordered panels |
| Disbursement method wrong | Methods without hardcoded “BOA / IBC”; real design |
| No bank accounts to select | Pick **TMS bank account** when transferring |
| No load linkage | `load_id` on create |
| Also truck / trailer | `unit_id` + `trailer_id` when trip/ops-related |
| Periods/cadence only | Add **deduct from next settlement (single/full)** **and** amortize |
| **Personal** advance | → driver-owed → **settlement deduction** |
| **Lumper fee** | → **expense** (or bill) on that **load** (+ truck/trailer as on load) — not fake personal amortize by default |
| Fuel / vendor / border | Explicit purpose→economic route in UI + books |

Detail tracker: `WIZARD-DEPTH-CREATE-CASH-ADVANCE-2026-07-22.md`.  
CODE block: **WIZARD-CASH-ADVANCE-CREATE-DEPTH**.

### Example D — OS-of-record word (2026-07-21 — you held Cursor to this)

> Real operating system of record — QuickBooks / NetSuite / McLeod / Alvys bar.  
> Every module and tab talks to the others (Dispatch ↔ HOS ↔ Maint ↔ Safety ↔ Insurance ↔ Legal ↔ Drivers ↔ Fleet ↔ Banking ↔ CoA ↔ Settlements ↔ Factoring ↔ Fuel).  
> Every money event economically complete.  
> Active product is the **new** design (kill dual-path / orphan-new).  
> No stone left unturned — linked, mounted, communicating, **proven**.

### How these examples compose

```
Insurance/Safety example     = ops hops + reverse drill + dual-path honesty
Create Advance example       = wizard field depth + purpose→GL/settlement/expense
Together                     = the bar for Settlements, Escrow, Liabilities,
                               Pay rates, Deductions, Book Load, Bills, …
```

---

## 0.2 How it SHOULD be — worked examples (target UX + books)

Use these as the **acceptance picture**. If the live wizard/screen cannot do the story end-to-end, it is **not done**.

### SHOULD-BE 1 — Insurance claim (accident on a load)

**Operator story:** Driver Juan wrecks unit T169 on load L-12047. Safety opens Accident → creates/links Insurance Claim.

| Step | What the UI must do | What the books / records must do |
|------|---------------------|----------------------------------|
| 1 | Accident drawer: pick **driver** (+ Create), **unit**, **load**, save **persists** (not fake fields) | Accident row FKs driver/unit/load; audit event |
| 2 | Claim create: same driver/unit/load/accident prefilled; +Create where missing | Claim row linked; appears on **Driver Detail → claims**, **Unit profile**, **Load**, **Insurance** |
| 3 | If deductible / recovery | Expense or liability + optional settlement deduction with claim provenance |
| 4 | If lawsuit | Legal matter ↔ lawsuit **both directions** (EntityLink) |
| 5 | Reverse | From Juan’s profile open claim; from claim open Juan / T169 / L-12047 / matter |

**Wrong:** bare selects; claim orphaned; DriverDetail has no claims reverse; ComingSoon Safety tab while Live fines exist.

### SHOULD-BE 2 — Safety fines / dual-path

**Operator story:** Open Safety → Fines.

| TODAY (defect class) | SHOULD BE |
|----------------------|-----------|
| Bookmark hits ComingSoon or old AccidentsPage while V6.4 tab exists | Always land on **Live** SafetyLayout tab (V6.4) |
| Old and new chrome both reachable | Old `@archived`; only new mount in `manifest` |
| Fine with no money trail | Fine → company expense and/or driver liability → settlement deduction with fine id → bank payment link reverse |

### SHOULD-BE 3 — Create Cash Advance (your walkthrough, full depth)

**Story A — Personal cash to driver**

1. Open Create Advance (flat drawer — **no boxes in boxes**).  
2. Driver: Juan (+ Create if needed).  
3. Purpose: **Personal / family**.  
4. Amount $500. Disbursement: **Transfer** → pick **IBC Operating** from **bank account list** (not a label that says “BOA/IBC”).  
5. Recovery: **Next settlement — deduct in full** (or amortize 4× if chosen).  
6. Save → driver advance owed by Juan → shows on **Driver → Advances**, **next settlement deductions**, banking disbursement trail.  
7. **No** load required (personal). Truck/trailer optional/N/A.

**Story B — Lumper on a load**

1. Same wizard, flat chrome.  
2. Purpose: **Lumper**.  
3. **Required:** Load L-12047 (picker); truck/trailer default from load, editable.  
4. Disbursement: Transfer → bank account **or** Comdata as used at dock.  
5. Economics: create **Expense** (or Bill) for lumper **on that load** — not a personal “4 weekly periods” debt unless you explicitly charge the driver back.  
6. Reverse: Load L-12047 shows expense; Unit/Trailer show cost; Accounting expense drills to load.

**Story C — Fuel cash advance on trip**

1. Purpose: Fuel deposit. Load + unit required.  
2. Cash advance rails + settlement recovery (per research: fuel **cash** advance ≠ fuel **card** expense).  
3. Recovery full-at-next or amortize — both available.

**Wrong (current Create Advance):** nested boxes; “BOA/IBC” hardcoded; no bank picker; no load/unit/trailer; periods-only; cannot choose personal→settlement vs lumper→expense.

### SHOULD-BE 4 — Settlements / closed / profile (same seriousness)

| Screen | SHOULD BE |
|--------|-----------|
| Driver Detail → Settlements | List open+closed; open S-2026-0185 → loads, advances recovered, fines, escrow lines; reverse to each |
| Settlement close | Preview deductions (advances, liabilities); CoA roles resolve (not empty legacy bindings); post + audit |
| Cash advance requests | Same linkage depth as Create Advance (load/unit/purpose/recovery) |
| Liabilities tab | Fine/claim provenance; recovery mode; link to settlement lines |
| Escrow | Per-driver liability sub-account; reverse from banking escrow tile |
| Pay rate templates / Deductions | Template ↔ drivers; policy ↔ settlement engine; not orphan list pages |

### SHOULD-BE 5 — Market bar (one line each)

| System | What we match |
|--------|----------------|
| **QuickBooks** | Money has account + vendor/customer + audit; bank register reverse |
| **NetSuite** | Controls: purpose decides posting path; no silent wrong GL |
| **McLeod** | Settlements show advances/deductions; load-centric costs |
| **Alvys** | Modern wizard: recovery mode full vs schedule; linked entities on create |

---

## 0.3 What Cursor WILL DO (execution — not aspiration)

Ordered work. Update status in §4 when PRs open. **Do not stop after chrome.**

| # | Action | Example standard | Output |
|---|--------|------------------|--------|
| 1 | Keep dual-path audit living; fix LIVE dual renders | Fleet #3222; Safety #3183 class | CODE PRs per finding |
| 2 | **Ship Create Advance wizard depth** | SHOULD-BE 3 | WIZARD-CASH-ADVANCE-CREATE-DEPTH PR: flatten chrome, bank select, load/unit/trailer, recovery full\|amortize, purpose→expense vs deduct |
| 3 | Purpose routing in API/FE | Personal→settlement deduct; Lumper→expense on load | Additive schema/API; posting flags OFF until CPA/Neon where required |
| 4 | Driver Detail reverse pack | SHOULD-BE 4 | Settlements, Advances, Liabilities, Escrow, Deductions, Pay rate links |
| 5 | Settlement close CoA | SHOULD-BE 4 + scoreboard Settle FAIL | `resolveRoleAccount` (HOLD if Neon roles missing — ask Jorge) |
| 6 | Claim/Accident persist + reverse | SHOULD-BE 1 | Accident fields save; claim on profiles; lawsuit↔matter (#3221+) |
| 7 | Wizard-depth audits for every remaining creator | §1.3 template | One tracker file per wizard → CODE |
| 8 | Law §9 scoreboard FAIL→PASS one path at a time | TRUE-CONNECTIVITY-MASTER | Expense→Bill→Settle→… with live proof |
| 9 | Tab-within-tab sweep | Arch design tabs | Every Drivers/Accounting/… nested tab gets A–E |
| 10 | Never claim done without | §0 Layer E | Live proof or UNVERIFIED |

**Remind phrase (paste to Cursor):**

> Execute `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` §§0–0.3 — Insurance/Safety/Accident examples + Create Advance SHOULD-BE stories (personal→settlement, lumper→expense, load/truck/trailer/bank). Do the table in §0.3. Do not redefine done as chrome.

---

## 1. Audit programs (run all; keep living)


### 1.1 Dual-path — OLD design vs NEW design (not showing)

| ID | Deliverable | Status | PR / doc |
|----|-------------|--------|----------|
| **AUD-DUAL** | System-wide OLD vs NEW matrix (what operators see TODAY) | OPEN audit | [#3220](https://github.com/tioperfumes07/IH35-TMS/pull/3220) `DUAL-PATH-OLD-VS-NEW-DESIGN-AUDIT-2026-07-22.md` |
| **FIX-DUAL-FLEET** | Fleet Vehicle/Trailer: kill dual Recent Activity | OPEN fix | [#3222](https://github.com/tioperfumes07/IH35-TMS/pull/3222) |
| **FIX-DUAL-ORPHAN** | Mount ORPHAN_NEW pages (Assets / Profitability / Payroll Integration / QBO Sync Status) or archive honestly | PENDING | — |
| **FIX-DUAL-RECURRING** | Accounting Recurring transactions ComingSoon → build or redirect | PENDING | — |
| **FIX-DUAL-SETTLE-COA** | Pay-run legacy `account_role_bindings` → `resolveRoleAccount` | HOLD financial | #3149 class |

**Every dual-path row must answer:** OLD look/behavior · NEW look/behavior · what shows TODAY.

### 1.2 True connectivity — Law §9 economic paths

Scoreboard: `TRUE-CONNECTIVITY-MASTER-2026-07-21.md` (12 paths — all FAIL as of open).

| Path | Status | Next CODE |
|------|--------|-----------|
| Expense | FAIL | FE source-links / reverse register |
| Bill | FAIL | bill_lines persist proof |
| Settle | FAIL | CoA resolver + FE close |
| Claim-Legal | FAIL→wiring | [#3221](https://github.com/tioperfumes07/IH35-TMS/pull/3221) EntityLink |
| Invoice | FAIL | income + load required |
| Factor | FAIL | live advance→JE proof |
| Fuel | FAIL | CoA maps HOLD |
| Maint WO | FAIL | unit_id on auto bill/expense |
| Safety-fine | FAIL | GL + settlement recovery |
| Bank | FAIL | register reverse |
| Escrow | FAIL | bridges + roles |
| Advance | FAIL | roles + **wizard depth below** |

### 1.3 Wizard / creator depth (field-by-field)

Template per wizard (copy for each):

1. Chrome (boxes-in-boxes? drawer vs modal?)  
2. Disbursement / pay-from (real bank accounts?)  
3. Ops FKs: driver, load, unit/truck, trailer, vendor, customer, WO, claim…  
4. Purpose → economic object (see §2)  
5. Recovery / settlement modes (next settlement full vs amortize…)  
6. Nested +Create (CreateDriverModal / unit / vendor…)  
7. Reverse drills from profile / load / settlement  

| Wizard / creator | Module | Audit doc | CODE status |
|------------------|--------|-----------|-------------|
| **Create Cash Advance** | Cash advances | `WIZARD-DEPTH-CREATE-CASH-ADVANCE-2026-07-22.md` + §2 below | BUILDING |
| Create Cash Advance Request | Driver finance | PENDING | — |
| Book Load (+ advance on book) | Dispatch | PENDING | partial load_id on book path |
| Settlement close / closed | Settlements | PENDING | — |
| Create Liability / Fine | Safety / Drivers | PENDING | — |
| Vendor Bill / Expense drawers | Accounting | PENDING | chrome partial |
| Claim create | Insurance | creators spine #3218 | linkage incomplete |
| Pay rate template | Drivers / Lists | PENDING | — |
| Deduction / auto-deduction policy | Drivers | PENDING | — |
| Escrow move / apply | Banking | PENDING | — |
| …all other +Create / +Book | all modules | PENDING — inventory from sidebar | — |

### 1.4 Creators spine (nested +Create)

| ID | Status | PR |
|----|--------|-----|
| PLUS-DRIVER-SYSTEM | OPEN | [#3218](https://github.com/tioperfumes07/IH35-TMS/pull/3218) |
| PLUS-UNIT / vendor / customer remaining | PENDING after #3218 | — |

### 1.5 Tab-within-tab / module nav

For each sidebar module (`SIDEBAR_ITEM_IDS`):

- Architectural design tab count vs LIVE mounts (`verify:arch-design`)  
- Nested deep tabs (e.g. Driver Detail: Profile / Settlements / Liabilities / Advances / …) each get §0 layers A–E  
- Drivers hub tabs: Settlements · Pre-settlements · Cash advances · Pay rate templates · Deductions · Profiles — **all in scope**

---

## 2. Create Cash Advance — full linkage requirements (owner 2026-07-22)

**Current wizard cannot** express the real economic story. Required design:

### 2.1 Ops links (always available as applicable)

| Link | Required when | Notes |
|------|---------------|-------|
| Driver | Always | + Create driver |
| Load | When advance is load-related (lumper, fuel on load, trip expense) | `load_id` on advance |
| Truck / unit | When tied to unit/trip | `unit_id` |
| Trailer | When tied to trailer/trip | `trailer_id` |
| Bank account | Disbursement = company transfer | From TMS bank accounts (not “BOA/IBC” text) |
| Vendor bill | Optional “apply to bill” | Keep, flatten chrome |

### 2.2 Purpose → economic routing (Law §9)

| Purpose / intent | Money outcome | Settlement / books |
|------------------|---------------|--------------------|
| **Personal** (family, personal cash) | Driver advance / receivable from driver | **Deduct from settlements** (next settlement full **or** amortize) |
| **Lumper fee** (carrier-paid at dock) | **Expense** (or bill) linked to **load** (+ unit/trailer as on load) | Not a personal settlement debt unless policy says driver-responsible |
| **Fuel deposit** (trip) | Advance and/or fuel expense per locked fuel policy | Load + unit; recovery per policy |
| **Vendor payment** | Vendor bill payment / expense linkage | Vendor + optional bill |
| **Border fee / other** | Explicit policy row (expense vs driver deduct) | Document in UI |

**Owner rule of thumb (this plan):**  
- If the company is advancing **personal money to the driver** → settlement deduction.  
- If the company is paying an **ops cost on a load** (lumper, etc.) → **expense (or bill) on that load**, with truck/trailer/load links — not a fake “periods only” personal amortize unless the driver is charged back.

### 2.3 Recovery modes (when driver-owed)

- **Next settlement — single / full** deduct  
- **Amortize** — periods + amount + cadence  
(Both required; periods-only is incomplete.)

### 2.4 Chrome

- No boxes-in-boxes; ParityDrawer / flat sections  
- Disbursement method without hardcoded bank names  

### 2.5 CODE block

**WIZARD-CASH-ADVANCE-CREATE-DEPTH** — FE + API (`load_id`, `unit_id`, `trailer_id`, bank account, `recovery_mode`, purpose→expense vs deduct routing). Financial posting flags remain OFF until CPA/Neon as required; schema additive.

---

## 3. Module-by-module wiring queue (Drivers / Settlements first)

Order (do not skip depth):

1. **Create Cash Advance wizard** (§2) — exemplar  
2. Cash advance requests (parity with create)  
3. Driver Detail reverse: Settlements · Advances · Liabilities · Escrow · Deductions · Pay rate  
4. Settlements list / close / closed — load + deductions + advances recovered  
5. Liabilities / fines → settlement or expense per model  
6. Escrow tile + bridges  
7. Pay rate templates + deductions policies  
8. Then Accounting · Banking · Dispatch · Safety · Insurance · Legal · Maint · Fleet · Factoring · Fuel — each tab + each wizard using §0 + §1.3 template  

---

## 4. Open PR index (living)

| PR | Role | Merge by |
|----|------|----------|
| #3218 | Creators spine (nested +Create) | Claude |
| #3220 | Dual-path OLD vs NEW audit | Claude |
| #3221 | Claim-Legal EntityLink | Claude |
| #3222 | Fleet dual-path activity fix | Claude |
| (next) | Create Advance wizard depth + purpose routing | Claude |
| (next) | Settlements domain reverse FE | Claude |

Cursor builds/pushes/PRs only unless owner says otherwise.

---

## 5. Reminder phrase for Jorge

> Cursor: execute `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` — especially **§0.1 owner examples** (Insurance/claim, Safety/accident dual-path, Create Cash Advance purpose→load/truck/trailer/bank/settlement-vs-expense). Full linkage, wizard depth, dual-path, purpose→economics. Do not redefine done as chrome.

---

## 6. Change log

| Date | Note |
|------|------|
| 2026-07-22 | Plan created from owner word + Create Advance deep findings (boxes, bank, load/unit/trailer, personal→deduct, lumper→expense). |
| 2026-07-22 | §0.1 added — binding examples: Insurance/claim/lawsuit, Safety/accident dual-path, Create Cash Advance walkthrough, 2026-07-21 OS-of-record word. |
| 2026-07-22 | §0.2 SHOULD-BE worked examples (claim, safety, advance stories A/B/C, settlements, market bar). §0.3 What Cursor WILL DO execution table. |
