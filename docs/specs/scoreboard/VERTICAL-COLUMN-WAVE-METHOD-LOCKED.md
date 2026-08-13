# VERTICAL COLUMN-WAVE METHOD — LOCKED (owner 2026-08-11 · amended 2026-08-12)

**Supreme lockdown:** `docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md` — read first  
**Status:** FINAL · reconciles class-sweep law with the module matrix  
**Authority:** This file + `MODULE-MATRIX-SCOREBOARD-LOCKED.md` win over seat module subset tables and horizontal module plans  
**Weekend mode:** WIRE ONLY · merge on local gate · **Live prove AFTER full wire** (Cascade / owner test pass)

---

## 1. What “vertical” means (FINAL — not blocks, not one module at a time)

**Vertical = one matrix COLUMN GROUP swept across ALL priority modules at once.**

| Wrong (forbidden) | Right (locked) |
|-----------------|----------------|
| Finish Accounting module, then Banking, then Dispatch | Drain **`driver` linkage column** on every applicable leaf in every priority module, then next column |
| 400+ block pile / random Tier-S chrome | One **column wave** = one ratcheting guard + every leaf that owes that column |
| `module-completion/*.json complete:true` = done | Matrix **Box 3 Built** on that leaf×column = wired; **Box 4 Live** only after system test |
| Build the insurance claim scenario now | Insurance §B9 is the **depth model** for every module — not the current sprint target |

**Reconciles with class-sweep law:** a matrix **column id** (`driver`, `reverse_link`, `gl_je`, …) **is** the defect class for wiring work. Coders share the same column id in INBOX/OUTBOX that week.

---

## 2. Priority modules (owner urgency — wave scope)

Wire these **first** (USMCA only · `5c854333-6ea5-4faa-af31-67cb272fef80`):

| # | Module | Matrix `required.json` |
|---|--------|-------------------------|
| 1 | **lists** | `docs/specs/scoreboard/modules/lists.required.json` |
| 2 | **accounting** | `…/accounting.required.json` |
| 3 | **dispatch** | `…/dispatch.required.json` |
| 4 | **settlements** | `…/settlements.required.json` |
| 5 | **factoring** | `…/factoring.required.json` |
| 6 | **banking** | `…/banking.required.json` |
| 7 | **customers** | `…/customers.required.json` |
| 8 | **vendors** | `…/vendors.required.json` |
| 9 | **drivers** (driver profile) | `…/drivers.required.json` |
| 10 | **safety** | `…/safety.required.json` |

**Wave 2 modules (after priority 10 Built):** maintenance · insurance · legal · fuel · fleet · driver-hub · cash-flow · finance hub · inventory · reports · (remainder per sidebar order).

---

## 3. Column groups (shared vocabulary — every coder same week)

From every `*.required.json` — subset per module, **same column ids**:

| Wave order | Group | Column ids | Wiring bar (create paths — schema assumed done) |
|------------|-------|------------|--------------------------------------------------|
| **A** | **linkage** | `driver` · `customer` · `vendor` · `unit` · `trailer` · `load` · **`claim` · `work_order` · `accident` · `policy` · `settlement` · `legal_matter`** (owner 2026-08-12 — §B9 link types as matrix columns) | Every picker/submit on applicable leaves writes **canonical FK** (not memo-only). Forward path: UI field → API payload → `mdata.*` / hub table. |

**TRAILER ≡ UNIT (owner 2026-08-12):** Any leaf that Requires `unit` **MUST** also Require `trailer`. Trailers (including reefers) follow the same multilayered bar as trucks — loads, maintenance, safety, accidents, insurance, documents, banking reverse, and (for reefers) **fuel/expense**. Guard: `verify-trailer-unit-linkage-parity` (step **3126**).

**LOAD ↔ TRIP EVENTS (owner 2026-08-12):** When equipment is on a trip, **`load` MUST link** to repairs / maintenance WOs / safety incidents / accidents / insurance claims (and reverse). Any leaf that Requires `work_order` · `accident` · `claim` · `scenario.maintenance` · `scenario.insurance` **MUST** also Require `load`. Same guard (**3126**).

**FUEL = FULL HUB (owner 2026-08-12 — trust correction):** A fuel event is not “driver+unit+expense only.” Operational fuel leaves Must Require the **full** linkage+money set: `driver` · `customer` · `vendor` · `unit` · `trailer` · `load` · `ap_bill` · `expense` · `gl_je` · `invoice` · `bank` · `connectivity` · `reverse_link` · `picker_law` · `qbo_chrome`. Columns existing on the module but omitted from leaf `required[]` = **false connectivity**. Same guard (**3126**). Chrome-only leaves (`settings`, toolbars, Loves price board) stay thin.
| **B** | **wiring (double linkage)** | `connectivity` · `reverse_link` | **Forward:** nav → route → component → API → canonical row. **Reverse:** EntityLink / graph / profile tab clicks **back** to source with live data. Code trace alone = not Built. |
| **C** | **money / economics** | `ap_bill` · `expense` · **`invoice` · `bank`** · `gl_je` · `liability` · `inventory` | Purpose picks money object; poster path exists; balanced JE when posting flag ON (CC-1). Header **and** lines; no silent skip. AR invoice + bank match are first-class columns (owner 2026-08-12). |
| **D** | **chrome** | `picker_law` · `qbo_chrome` | V2: `+ Add new` first row → module creator → same table R=W → selected → reload. V1: ParityDrawer, calendar, `+ Create`. |
| **E** | **process** | `scenario.*` | Scenario probe holds **after** A–D wired on that slice — not before. |

**Surface inventory (owner 2026-08-12):** every Modal / Drawer / Panel / Wizard / Sheet / Dialog / Flyout / Popover / ParityDrawer host is a **Required leaf** (rows), not a column. Guard: `verify-required-surface-inventory-complete` (step **3118**).

**Owner sequence for coders:** **A → B → C → D** on all priority modules **in parallel lanes** (disjoint hotfiles). **E + Box 4 Live** = **after entire software wired** — system test pass, not during wire sprint.

---

## 4. Depth model (insurance §B9 — TYPE for every module, not build-now)

The insurance claim chain in `docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md` §B9 is the **minimum depth standard** for **every** module leaf:

- **Forward:** every hub FK populated on create/update (policy, driver, unit, load, accident, vendor, WO, bill, expense, liability, deduction, settlement, bank, JE, … as applicable).
- **Reverse:** graph or list endpoint returns populated arrays; every EntityLink walks back live.
- **Economics:** money terminus posts balanced JE; escrow/settlement/deductible paths connect.
- **Two routes each hop:** backend writer + frontend click-back.

**Other modules use the same shape** (examples — each has a leaf×column matrix row, not a one-off audit):

| Module | Example chain (same depth bar as §B9) |
|--------|----------------------------------------|
| Dispatch | Book load → customer · load → driver/unit/trailer → dispatch → deliver → POD → invoice |
| Settlements | Settlement → driver → lines → driver bill → AP → bank → JE · deductions → escrow |
| Banking | Bank txn → categorize → vendor/customer/driver GL → expense/bill → matched JE → register drill |
| Maintenance | WO → unit · vendor · claim → bill → payment → GL |
| Safety | Accident → spawn claim → driver liability → settlement deduction |
| Lists | Card → list → +Create → canonical row → picker on every consumer module |

**Assumption (owner 2026-08-11):** FK columns + graph/read endpoints are **largely built**. Remaining work = **create paths** (wizards, submit payloads, posters, EntityLinks) until matrix **Box 3 Built** is green on every owed cell.

---

## 5. Per-PR law (one column × all touched leaves)

1. **One FINDING** = one column id (e.g. `WAVE-A-driver`) across all priority modules you touch that week — or one leaf×column if hotfile forces serial.
2. **Ratcheting guard** names the column + file pattern; fails on any remaining memo-only / dead EntityLink / missing submit field.
3. **MODULE_PROGRESS** cites matrix Built cells moved, not checklist N/M alone.
4. **Merge:** local gate PASS → `--admin` if Actions down → OUTBOX `TIER=WIRE | column=driver | Built +N cells | NEXT=…`
5. **Forbidden OUTBOX:** “linkage done” · “module complete” · “insurance done” without Box 4 Live after test pass.

---

## 6. Lane split during column waves

| Column group | Primary lanes |
|--------------|---------------|
| A linkage atoms | Codex (pickers/creators) · CC-2 (FE submit) · CC-1 (FK writers on money forms) |
| B connectivity + reverse | Codex · Devin · CC-2 · Cursor overflow |
| C money / GL | **CC-1 only** (serial money) |
| D chrome | Codex · CC-2 · Cursor |
| E prove / Box 4 Live | **Cascade only** — after owner wire-complete test pass |

**Cursor lead:** merge serial · scoreboard honesty · INBOX/OUTBOX · overflow when seat stuck >15m.

---

## 7. When the software is “wired” vs “tested”

| Phase | Matrix target | Who |
|-------|---------------|-----|
| **Wire sprint** (now) | **Box 3 Built** on every Required cell in priority 10 | All coders, column waves A→D |
| **System test** (after wire) | Exercise flows USMCA · fix reds | Owner + Devin + Cascade |
| **Certification** | **Box 4 Live** · PROD-VERIFIED ledger | Cascade GUARD · honest matrix % |

**Weekend merge mode:** coders merge on **local gate** during wire sprint; **do not** block merge waiting for Box 4 Live. Live moves **after** test pass.

---

## 8. Pointers

- Scoreboard cell definitions: `MODULE-MATRIX-SCOREBOARD-LOCKED.md` §FINAL DEFINITIONS  
- Merge while CI down: `~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/LAW-MERGE-WHILE-CHECKS-DOWN.md`  
- Depth spec: `docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md` §B8–B12  
- Owner P0 sequence: `~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/OWNER-SEQUENCE-P0-2026-08-11.md`
