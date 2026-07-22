# FULL SYSTEM — AUDIT & WIRING MASTER PLAN (2026-07-22)

**Owner purpose:** permanent checklist so Jorge can remind Cursor later, and Cursor cannot “forget” the bar.  
**Standing law:** Rule 21 (`.cursor/rules/21-full-system-no-partial-amnesia.mdc`) + Law §9 (`ARCHITECTURE-BLUEPRINT-2026-07-05.md`) + owner word 2026-07-21 (OS of record).  
**How to remind Cursor:** paste this path — `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` — and say **“execute the master plan.”**

---

## 0.0 Partnership — do it correctly (owner 2026-07-22)

Jorge’s instruction: Cursor must **help design and wire the OS correctly**, not invent thin TMS forms. **Market systems are the MINIMUM**, not aspirational.

### Universal deep linkage (NOT claims-only)

Claims / legal are **examples**, not the only place this applies. **No stone left unturned** across the entire product:

| Domain | Must link both ways (when involved) |
|--------|-------------------------------------|
| Safety | Accident, incident, fine, violation ↔ driver, unit, trailer, load, claim, legal, settlement deduction |
| Compliance / FMCSA | DQ file, medical, MVR, Clearinghouse, HOS ↔ driver; unit inspection / 2290 / IFTA ↔ unit |
| Vehicles / Fleet | Unit ↔ WO, parts, vendor bill, expense, claim, accident, fuel, load assignment, escrow/lease if OO |
| Trailers | Same class as units where applicable |
| Dispatch / Loads | Load ↔ customer, driver, unit, trailer, stops, advances, lumper expense, claim, detention |
| Settlements | Statement lines ↔ loads, advances, fines, claim deductibles, escrow in/out — itemized (Alvys / 49 CFR 376) |
| Escrow | Balance + every deposit/withdrawal ↔ driver (and truck when OO), purpose, claim/advance/WO provenance |
| Banking | Bank txn ↔ expense/bill/payment/transfer + entity + audit (WF-012 single-link) |
| Accounting | Every money object ↔ CoA + counterparty + ops provenance + audit |
| Maintenance | WO ↔ unit/trailer, vendor, parts invoice, bill/expense, claim if damage, load if roadside on trip |
| Insurance / Legal | Claim ↔ policy, accident, driver, unit, trailer, load, WO, lawsuit, matter, money recovery |
| Drivers | Profile reverse: settlements, advances, escrow, claims, accidents, fines, liabilities, pay rates |

**Wrong:** deep wiring only on Insurance Claim create.  
**Right:** every module/tab/wizard audited to Law §9 + purpose→economics at the same seriousness as §0.1 A2 / C.

Claims A2 is the **depth sample**. Safety, compliance, vehicles, settlements, etc. get the **same bar**.

### Reference systems (always research fresh before recommending)

| Domain | Minimum bar |
|--------|-------------|
| Accounting trust / claim proceeds / deductible residual | **QuickBooks Online** — repair/loss expense full; insurer deposit credits same expense (not sales); residual = deductible; optional Insurance Claims Receivable when approved |
| Controls / fixed asset + insurance on asset | **NetSuite** — asset Insurance subtab; claim on asset; write-off/disposal path; receivable only when fixed & determinable; repair vs capitalize per policy |
| Trucking ops seriousness | **McLeod-class** — accident ↔ unit/driver/load; claim file; settlement itemization |
| Modern TMS settlements / escrow | **Alvys** — deductions from driver **or** truck; escrow deposit/withdrawal; **split** payroll vs escrow as **separate** transactions; claim-related costs itemized on statement |
| Carrier law / lease truth | **49 CFR Part 376** — itemized settlement; authorized deductions; event-driven accident damage + deductible reserve (escrow) disclosed |
| Books law | **US GAAP** — insurance receivable when probable/approved; no premature gain; capitalize vs expense per CPA |

### How Cursor works with Jorge on every deep block

1. **Research first** — cite QBO / NetSuite / McLeod / Alvys / GAAP (or FMCSA) for the decision.  
2. **RESPOND BEFORE CODE** — decision tree + linkage matrix + what money objects are created.  
3. **Owner locks** any ambiguous money routing (asset vs expense, escrow vs settlement default).  
4. **Build UI + FKs + reverse drills** first; **posting/migrations = financial HOLD** (`JORGE-APPROVED` + Neon).  
5. **Evidence** — live proof or **UNVERIFIED**. Never “done” on CI alone.  
6. **Never dilute** §0 / §0.1 examples. Claims = Example A2 depth; advances = Example C depth; settlements = full statement economics.

### Honest repo gap (claims — verified in code 2026-07-22)

`createClaimBodySchema` today: policy, asset, accident_date, amounts, notes, + graph FKs `accident_report_id` / `load_id` / `driver_id`.  
**Missing vs A2 / market bar:** fault, driver_responsible, trailer_id, deductible_cents, recovery_rail (escrow|settlement|split), insurance_receivable / driver_liability objects, WO/vendor FK, reverse surfaces on Driver/Unit/Trailer/Load/Escrow/Settlement with claim provenance.

That gap is exactly why block **`WIZARD-CLAIM-ECONOMICS-DEPTH`** exists — Cursor designs with Jorge to market standard, then codes without inventing shortcuts.

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

**Done only when:** create → row → GL/expense if money → driver profile reverse → unit reverse → load reverse → legal matter reverse (as applicable) — proven live or honest **UNVERIFIED**.

### Example A2 — Insurance claim economics (owner 2026-07-22 — FULL depth)

**Not enough:** “claim has a driver field.”  
**Required:** every relevant ops link **and** a **purpose/fault → money** decision tree (same seriousness as Create Advance personal vs lumper).

#### Ops links on claim / accident (every possible link that applies)

| Link | Required |
|------|----------|
| Driver | Always when a driver was involved |
| Vehicle / truck (unit) | Always when a unit was involved |
| Trailer | When a trailer was involved |
| Trip / load | When on a trip / load |
| Accident report | When claim arises from accident |
| WO / repair | When repair is tracked as maintenance WO |
| Legal matter / lawsuit | When litigated |
| Insurance policy | When insured |
| Vendor (shop / tow) | When third party repairs |

Reverse: each of those profiles/pages must show the claim (forward + reverse).

#### Fault / responsibility → what money object is created

| Situation | What should happen in TMS books |
|-----------|----------------------------------|
| Accident, **not our fault** (other party / their insurance pays) | Claim tracks recovery from other carrier/insurer; may still link driver/unit/load/trailer for ops; **no** driver deductible deduction unless policy says otherwise |
| Accident, **our fault** / company liability | Claim + possible expense/reserve; links stay |
| **Driver responsible** and **driver pays deductible** | Deductible → **expense** (or receivable) **with claim provenance** → recover via **settlement deduction** and/or **escrow** draw per policy (owner chooses / records which) |
| **No insurance** (or not covered) and **we pay for the fix** | Repair cost → post to **asset** (capitalize to unit) **or** expense per CPA policy — **not** silent; must link **unit + claim + WO/vendor invoice**; if driver share owed → settlement/escrow deduction for their portion |
| Company pays deductible then recovers from driver | Company expense/outlay first → driver liability → settlement and/or escrow recovery with claim id on the deduction |
| Escrow only vs settlement only vs split | **Always ask** (owner lock 2026-07-22) — escrow / next settlement / both — never implied, never auto-default |

#### SHOULD-BE operator story (claim)

1. Accident on load L-12047, unit T169, trailer TR-88, driver Juan — all four linked and saved.  
2. Mark **fault** (ours / not ours / shared) and **driver responsible?** (yes/no).  
3. If driver pays deductible $2,500 → create deductible money object linked to claim → choose recovery **escrow** and/or **next settlement**.  
4. If uninsured repair $18,000 we fund → asset or expense on **T169** + vendor/WO + claim; Juan’s share (if any) via escrow/settlement.  
5. Open Juan’s profile → see claim + open deductible balance. Open T169 → see claim + repair. Open L-12047 → see claim. Open escrow/settlement → see deduction lines with claim id.

#### Honest status in this plan (2026-07-22)

| Piece | In report before this update? | Now |
|-------|------------------------------|-----|
| Driver / unit / load on claim | Yes (high level) | Yes |
| Trailer / trip / WO / policy / vendor | **Weak / not spelled** | **Added here — required** |
| Fault / driver responsible | **No** | **Added — required** |
| Deductible → expense + settlement/escrow | One vague line | **Full tree above** |
| Uninsured repair → asset account | **No** | **Added — required** |
| CODE | Claim-Legal money FK still FAIL; #3221 is FE reverse only | Block: **WIZARD-CLAIM-ECONOMICS-DEPTH** (financial HOLD for posting) |

**CODE block name:** `WIZARD-CLAIM-ECONOMICS-DEPTH` — wizard fields for fault, responsibility, deductible, recovery rail (escrow/settlement/split), asset-vs-expense for uninsured repair; full ops FKs; reverse drills. Posting flags OFF until CPA/Neon.

#### Market-correct money objects (design lock — posting HOLD)

| Event | QBO / GAAP-shaped books | McLeod / Alvys-shaped ops |
|-------|-------------------------|---------------------------|
| Repair bill paid (insured) | Dr Expense (or Asset if capitalize); Cr Bank/AP | Linked to claim + unit + WO/vendor |
| Insurer pays | Dr Bank; Cr **same** expense (or Insurance receivable → Bank) — **not** sales income | Claim status → paid; deposit linked to claim |
| Residual after insurer | = company deductible / unreimbursed loss | Still on claim |
| Driver owes deductible | Dr Driver receivable / liability; Cr expense recovery or AP clear | Deduction on **settlement** and/or **escrow withdrawal**; Alvys-style **split = two lines**; line shows claim id |
| Uninsured / we fund repair | Expense **or** capitalize to unit (CPA lock) | Unit + claim + WO; optional driver share via escrow/settlement |
| Not our fault / 3rd party pays | Track recovery receivable from other carrier/insurer | Ops links remain; no driver deduct unless lease says so |

**Owner decisions (2026-07-22 locks + open):**

| # | Question | Owner lock |
|---|----------|------------|
| 1 | Driver deductible recovery rail | **LOCKED: always ask** (escrow / next settlement / split) — never auto-default |
| 2 | Uninsured repair: capitalize vs expense | **LOCKED: Choice Z — always ask** (expense vs capitalize). **No $ threshold.** If **driver fault / responsible**, driver owes the **full company-funded repair** (e.g. $8,000 in Example E) — recover via always-ask rail; capitalize vs expense is still asked for the **company books** treatment of whatever remains after / alongside driver recovery. |
| 3 | Deductible books shape | **LOCKED: Option C** — expense residual + Driver A/R (Example D). |

#### Example E — Uninsured repair: expense vs capitalize (same story, two books)

**Facts (no insurance pays — we fund the fix):**

- Driver **Juan**, unit **T169**, trailer **TR-88**, load **L-12047**, claim/incident **CLM-0051** (or safety incident if no policy).
- Shop repairs T169 for **$8,000** (vendor + WO-T169-…).
- **No insurer recovery** (uninsured / denied / below coverage).
- **If Juan’s fault / responsible (owner lock):** he owes **$8,000** (full repair) — recover via **always-ask** escrow/settlement/split. Not “deductible only.”
- If **not** his fault: company may absorb; still link ops; no driver A/R unless policy says otherwise.
- **No dollar threshold** in the product — never “if > $X capitalize else expense.”
- **Z LOCKED:** operator always chooses expense vs capitalize for company books.

##### Choice X — Expense the whole repair (P&L)

| When | Entry | What you see |
|------|-------|--------------|
| Pay shop $8,000 | Dr **Repairs & maintenance** $8,000 · Cr Bank/AP $8,000 | Hits current-period P&L |
| Links | — | Claim/incident + T169 + WO + vendor + load/driver |
| If Juan owes $2,000 | Open Driver A/R (if Option C) + recover via ask-rail | Same reverse drills |

- **When it’s right:** ordinary repair that does not extend useful life / restore beyond prior condition (GAAP repair vs betterment).
- **What operators feel:** simple; unit cost basis unchanged.

##### Choice Y — Capitalize to the unit (Balance sheet / asset)

| When | Entry | What you see |
|------|-------|--------------|
| Pay shop $8,000 | Dr **Fixed asset – T169** (or Accumulated improvement) $8,000 · Cr Bank/AP $8,000 | Increases carrying value of T169 (NetSuite-style asset work) |
| Links | — | Same ops graph + asset register / unit profile shows capitalized repair + claim |
| Depreciation | Later periods | Depreciate improvement per CPA life |
| If Juan owes $2,000 | Still Driver A/R + ask-rail; company net capitalized = $6,000 if he pays | Clear split company vs driver |

- **When it’s right:** major restoration / betterment that CPA treats as capital (not routine R&M).
- **What operators feel:** unit financial history shows the repair as part of the truck, not just an expense blip.

##### Choice Z — Always ask (**LOCKED** owner 2026-07-22)

On every uninsured (or company-funded) repair wizard step:

> “Post this repair as: **Expense (P&L)** · **Capitalize to unit asset**”

No auto $ cutoff. Never silent threshold.

**Driver fault / responsible (owner lock):** If it was **his fault**, he owes the **full repair** (Example E: **$8,000**), not only a policy deductible. Recovery rail = **always ask** (escrow / settlement / split). Company still chooses Z (expense vs capitalize) for how the outlay / residual sits on the books (typically: open Driver A/R $8,000 under Option C discipline; clear as he pays; expense or asset treatment per Z for the company side).

| Why Z | Matches owner: no threshold + explicit books choice every time. |

---

#### Example D — Deductible books: one concrete story (**Option C LOCKED**)

**Facts (same story for all options):**

- Driver **Juan**, unit **T169**, load **L-12047**, claim **CLM-0042** (our fault; driver responsible).
- Shop repair bill: **$12,000** (vendor Love’s / WO-T169-…).
- Policy deductible: **$2,500** (driver owes this).
- Insurer will pay: **$9,500**.
- Company pays the shop **$12,000** from operating bank today.
- Later: insurer deposits **$9,500**; Juan recovers **$2,500** via settlement and/or escrow (**always ask** which).

##### Step 0 — always (ops + QBO-shaped repair)

| What | Books (shape) | Ops links |
|------|---------------|-----------|
| Pay shop $12,000 | Dr **Repairs expense** $12,000 · Cr Bank $12,000 | Claim CLM-0042 + unit T169 + WO + vendor |
| Insurer pays $9,500 | Dr Bank $9,500 · Cr **Repairs expense** $9,500 (not sales) | Same claim id on deposit |

After Step 0, **Repairs expense residual = $2,500** = economic deductible. That is the QBO residual pattern.

Now: how do we treat Juan owing that $2,500?

---

**Option A — Expense residual only (no driver A/R on books)**

| When | Entry | What you see |
|------|-------|--------------|
| After insurer | Leave $2,500 in Repairs expense | P&L shows company ate deductible |
| Recover from Juan (settlement $1,500 + escrow $1,000) | Dr Settlement payable / escrow · Cr **Repairs expense** (or Other income–recovery) $2,500 | Expense nets toward $0; **no** open A/R |

- **Pros:** Simple; matches “deductible left in expense until recovered.”  
- **Cons:** Until Juan pays, books do **not** show “Juan owes us $2,500” as an asset — only ops notes / deduction schedule.

---

**Option B — Driver A/R (receivable) for the full deductible**

| When | Entry | What you see |
|------|-------|--------------|
| When driver responsibility confirmed | Dr **Driver receivable – Juan** $2,500 · Cr Repairs expense (or Due from driver clearing) $2,500 | Balance sheet: Juan owes $2,500; expense net of recovery expectation |
| Settlement takes $1,500 | Dr Settlement / Cr Driver receivable $1,500 | Receivable → $1,000 |
| Escrow takes $1,000 | Dr Escrow liability (or escrow cash) / Cr Driver receivable $1,000 | Receivable → $0 |

- **Pros:** Clear “who owes what”; matches NetSuite-ish receivable discipline; Driver Detail shows open balance.  
- **Cons:** Extra account; must clear receivable when recovered (Alvys-style two lines still OK).

---

**Option C — Both (recommended for OS-of-record / court-grade) — expense tells loss story; A/R tells who owes**

| When | Entry | What you see |
|------|-------|--------------|
| Pay shop + insurer (Step 0) | Same as above → $2,500 residual in expense | True cost of claim on P&L until recovered |
| Confirm Juan owes deductible | Dr **Driver receivable – Juan** $2,500 · Cr **Driver deductible clearing** (or recoveries) $2,500 | A/R open; expense still shows economic loss until clearing policy chosen |
| Recover via settlement/escrow | Cr Driver receivable as money comes in; clearing/expense nets | Driver Detail + claim + settlement + escrow all show CLM-0042 |

- **Pros:** P&L honesty **and** “Juan owes $2,500” on BS; full drill-through. Matches “serious ERP + TMS.”  
- **Cons:** Needs CoA accounts + posting flags OFF until CPA/Neon.

---

**Owner lock (2026-07-22):** **Option C.**  
UI captures fault / responsibility / amounts / always-ask recovery; posting HOLD until CPA/Neon. When driver fault on uninsured full repair, Driver A/R = **full** amount (Example E $8,000), same C discipline.

---

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

**Operator story:** Driver Juan wrecks unit T169 + trailer TR-88 on load L-12047. Safety opens Accident → Insurance Claim.

| Step | What the UI must do | What the books / records must do |
|------|---------------------|----------------------------------|
| 1 | Accident drawer: **driver**, **unit**, **trailer**, **load** — all persist | Accident FKs + audit |
| 2 | Claim: same links + policy; +Create where missing | Claim on driver / unit / trailer / load profiles |
| 3 | Capture **fault** + **driver responsible?** | Drives money routing (see §0.1 Example A2) |
| 4 | If driver deductible | Expense/receivable + recovery via **settlement** and/or **escrow** with claim id |
| 5 | If no insurance / we pay repair | **Asset** (or expense per CPA) on unit + WO/vendor + claim; driver share if any via escrow/settlement |
| 6 | If lawsuit | Legal matter ↔ lawsuit both ways |
| 7 | Reverse | From Juan / T169 / TR-88 / L-12047 / claim / escrow / settlement — all open each other |

**Wrong:** bare selects; claim orphaned; no fault/responsibility; deductible with no settlement/escrow rail; uninsured repair with no asset/unit link; DriverDetail missing claims reverse.

See **§0.1 Example A2** for the full decision tree.

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

**Sequence authority (owner 2026-07-22):** `docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md`  
**Scoreboard:** `docs/trackers/MODULE-DEEP-AUDIT-SCOREBOARD-2026-07-22.md` (30 modules)

Order: **Phase 0 law lock → Phase 1 module deep audit (Jorge click-through + economics) → Phase 2 build that module’s PRs → Phase 3 leftover pile items → Phase 4 launch gates.**  
Do **not** redefine done as chrome. Do **not** skip module audits to “burn the old pile” first — the pile *is* mostly this work.

Ordered tactical table (still valid inside Phase 1–2):

| # | Action | Example standard | Output |
|---|--------|------------------|--------|
| 1 | Keep dual-path audit living; fix LIVE dual renders | Fleet #3222; Safety #3183 class | CODE PRs per finding |
| 2 | **Ship Create Advance wizard depth** | SHOULD-BE 3 | WIZARD-CASH-ADVANCE-CREATE-DEPTH PR: flatten chrome, bank select, load/unit/trailer, recovery full\|amortize, purpose→expense vs deduct |
| 3 | Purpose routing in API/FE | Personal→settlement deduct; Lumper→expense on load | Additive schema/API; posting flags OFF until CPA/Neon where required |
| 4 | Driver Detail reverse pack | SHOULD-BE 4 | Settlements, Advances, Liabilities, Escrow, Deductions, Pay rate links |
| 5 | Settlement close CoA | SHOULD-BE 4 + scoreboard Settle FAIL | `resolveRoleAccount` (HOLD if Neon roles missing — ask Jorge) |
| 6 | Claim/Accident **economics** + reverse | SHOULD-BE 1 + **§0.1 A2** | Fault, driver responsible, deductible→settlement/escrow, uninsured→asset, full ops FKs (driver/unit/trailer/load/WO/policy); block `WIZARD-CLAIM-ECONOMICS-DEPTH` (financial HOLD for posting) |
| 7 | Wizard-depth audits for every remaining creator | §1.3 template | One tracker file per wizard → CODE |
| 8 | Law §9 scoreboard FAIL→PASS one path at a time | TRUE-CONNECTIVITY-MASTER | Expense→Bill→Settle→… with live proof |
| 9 | Tab-within-tab sweep | Arch design tabs | Every Drivers/Accounting/… nested tab gets A–E |
| 10 | Never claim done without | §0 Layer E | Live proof or UNVERIFIED |
| 11 | **Module deep audits (30)** per OWNER-EXECUTION-PLAN | Jorge click-through + economics | Desktop `modules/<name>.md` + scoreboard |

**Remind phrases (paste to Cursor):**

> Execute `docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md` — do not invent a new sequence.

> Execute `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` §§0–0.3 — Insurance/Safety/Accident examples + Create Advance SHOULD-BE stories. Do not redefine done as chrome.

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
| Claim-Legal | PARTIAL (FE reverse drill CI-green) | [#3221](https://github.com/tioperfumes07/IH35-TMS/pull/3221) lawsuit↔matter EntityLink; money FK/deductible still FAIL |
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
| #3220 | Dual-path OLD vs NEW audit + **this master plan** | Claude |
| #3221 | Claim-Legal EntityLink | Claude |
| #3222 | Fleet dual-path activity fix | Claude |
| **#3223** | **Create Advance wizard depth + purpose routing** (HOLD Neon migration + lumper JE) | Claude / owner Neon |
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
| 2026-07-22 | §0.1 **Example A2** — claim economics: fault, driver responsible, deductible→settlement/escrow, uninsured→asset, full ops links (trailer/trip/WO/policy). Honest: was only partial before. |
| 2026-07-22 | §0.0 Partnership — market systems are MINIMUM; research→design→owner locks→build; claim schema gap named; QBO/NetSuite/Alvys/GAAP money-object table + 3 owner CPA questions. |
| 2026-07-22 | Universal deep linkage table (safety/compliance/fleet/settlements/… — not claims-only). Lock #1 always-ask recovery; #2 no $ threshold. Example D A/B/C for deductible books. |
| 2026-07-22 | RULE 22 permanent + Rule 14/21: system-wide linkage. Example E for Q2 (expense vs capitalize). Cursor recs: Q2=always ask; Q3=Option C. |
| 2026-07-22 | **Owner locks:** Q2=Z no threshold + if driver fault owes full repair ($8k Example E); Q3=**C**. |
