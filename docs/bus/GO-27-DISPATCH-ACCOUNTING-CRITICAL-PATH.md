# GO-27 — THE CRITICAL PATH TO BOOKING REAL LOADS
## Dispatch + Accounting only. Everything else waits.
**Recommendation, 2026-09-02 · verified against `origin/main 535e86367` and live production**

---

## MY HONEST RECOMMENDATION FIRST

**Only three things genuinely block you from booking load number one.** Everything else on the 72-row register can be fixed *while you book*.

The instinct to fix every little thing before starting is the reason this has not started. A wizard with an ugly label still books a load correctly. A number minted in the wrong format does not — and it cannot be un-minted once children inherit it.

**So the dividing line is not big-versus-small. It is reversible-versus-permanent.**

- **Permanent if wrong** → fix before the first load. There are three.
- **Annoying but reversible** → fix while you book. Everything else.

---

# GATE 0 — BEFORE YOU BOOK. Hours, not days.

Three items. Each one is permanent if it lands wrong.

### 0.1 · Purge USMCA to zero — GO-26
~900 fixture rows across ~70 tables. Until this clears, your first real load lands in a book that already contains 607 posting batches, 118 reconciliation matches and 5,875 burned load numbers. Every margin and every aging you look at afterwards is computed over that noise.
**Seat: CC-1. One PR per schema. Void, then delete.**

### 0.2 · Reseed the load counter — and mind the token trap
`lib.trace_counters` is keyed `(operating_company_id, doc_type, last_trace_no)`.
**The trap: existing rows use `'LD'` while `allocateNextLoadNumber` queries `doc_type = 'LOAD'`.** They do not match. Pick one token, confirm what is actually in the table, make the code query exactly that, and never invent a third.
After clearing 5,875 reservations, seed `last_trace_no` to the number you name.
**Seat: CC-1. Same PR as 0.1.**

**OWNER SEED LOCKED 2026-09-02:** Kill `LD` row; keep `LOAD` only. `last_trace_no = 13556` so next auto-mint = **13557**. Load **13508** stays (owner real). August one-sheet numbers typed manually; skip Transportation gaps (13509, 13515, etc.).

### 0.3 · Drop the `B-` on the driver bill
`driver-finance/driver-bill-number.ts` — four lines:
```ts
export function driverBillNumberFromLoadNumber(loadNumber: string): string {
  const suffix = loadNumber.replace(/^[Ll]-/, "");
  return `B-${suffix}`;          // <-- must return the load number unchanged
}
```
Your rule: the driver bill number **equals** the load number. This is the last piece of the numbering chain still wrong.
**Good news — the expense half is already done.** `formatLoadExpenseNumber` already renders the first expense as the bare load number and suffixes from the second (`12225`, `12225-1`, `12225-2`). Its own test asserts it.
**Seat: CC-1. One file.**

### YOU: name the load number seed.
That is the only thing Gate 0 needs from you.

> **After Gate 0 you can start booking.** Do not wait for anything below.

---

# GATE 1 — BOOK THE LOAD CLEANLY. Days 1–2, while you are already booking.

### 1.1 · K2 pickers — 277 files trap you
This is the one that will make you want to throw the laptop. Open a picker, click elsewhere, the list stays open and you are forced to select something to escape. It happens on Section A charge rows and on pickup/delivery State — the two places you type most.
Only `components/Combobox.tsx` dismisses on outside click, and the wizard imports two of the three broken ones. **Guard first, then migrate by directory.**
**Seat: CC-2. Highest-value single fix for daily data entry.**

### 1.2 · B1 — remove `AlwaysTrack load # (legacy)`
`BookLoadModalV4.tsx:1589`. Still rendered, and it is a machine name on an operator label. **Seat: CC-3.**

### 1.3 · Chrome-prove miles and the location picker on 13508
Miles fill for all 3,338 lanes since #19689 — but 13508's `updated_at` still equals `created_at`, so nobody has re-opened it. And `load_stops.location_id` is **0 of 2**: the picker was built, 9 USMCA locations exist, nobody has proved it on a real load.
**Seat: CC-2. One Chrome pass answers both.**

### ⚠ MILES-INVERT-01 — STOP-BEFORE-PAY — JORGE LAW (2026-09-02)
**Driver pay = ALWAYS short miles. NEVER practical.** STOP auto-fill pay from catalog `short_miles` until inverted rows fixed.

Indy→Laredo (load 13508): practical 1319.7 + empty 207.6 = 1527.3 ≠ short 1478.1. **2,142/3,237 lanes (66.2%)** have `short_miles > practical_miles` — all `source=History`. Laredo→Indy normal; Indy→Laredo inverted. Cursor acknowledged MilesStrip "short includes empty" copy was **wrong**.

**Owner law (LOCKED):** Customer RPM = rate/practical · Company CPM = cost/(practical+empty) · driver pay = short miles · overage = driver's problem · empty on 2,398 lanes avg 251.9.

**CC-1 owns:** remediation restores short = shortest (PC*MILER / re-key / quarantine) → no mass-swap → wizard flag when short>practical + operator confirm/override typed short. **Gate 0 unaffected.**

Canonical: `docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md`

### 1.4 · B5 — driver pay rate resolves from the profile
A typed rate is how a settlement goes wrong silently. `#19699` merged; confirm the profile value wins over the typed field. **Seat: CC-1.**

### 1.5 · GO-06 manual numbers — finish the UI
Further along than any register says. `next-number` endpoints already exist for **loads, invoices, bills, expenses, payments, credit memos and vendor credits**, and Book Load already sends `requested_load_number`. What is missing is the shared number field on the remaining create screens. **One component, not twelve.**
**Seat: CURSOR.**

---

# GATE 2 — COST THE LOAD. Days 2–4. This is the accounting half.

### 2.1 · `accounting.bills.driver_uuid` — MISSING. Fix this first in Gate 2.
`trailer_id` ✅ and `recover_from_driver` ✅ landed. The driver column did not.
**This is your road-repair scenario.** A repair billed on 30-day terms that must appear on a driver settlement has nowhere to record which driver. It blocks the Load Costs board and the company settlement behind it.
**Seat: CURSOR. Data + backend + the bill creator screen.**

### 2.2 · The Load Costs tab — your 13th tab
The screen you designed: open a load, see its costs underneath, add diesel, tolls, lumpers and vendor bills against it, each born attached to the load with the number assigned automatically. Expense-or-Bill toggle per row, because one load routinely has both.
This is where the month's real expenses get entered. It reads `mdata.loads`, `accounting.expenses`, `accounting.bills` and the driver pay tables. **It writes nothing new — it calls the same endpoints everything else uses.**
**Seat: CODEX. Blocked only on 2.1.**

### 2.3 · Proforma mints at pickup, not at booking
`book-load.service.ts:1938` still mints `ND-INV-01` at book. A proforma for a load never picked up is a document for work that never happened, and it burns the number early. The delivery half is correct — do not touch it.
**Seat: CURSOR.**

### 2.4 · Designate `fixed_asset_default` for USMCA
The $7,000 capitalize rule **is** wired (`wo-ap-posting.service.ts:183`). But `:481` fails closed with a 409 when the fixed-asset role is not owner-bound. **A repair at or above $7,000 will refuse to post until you designate that account.** One setting.
**YOU, once. Then CC-1 confirms both sides of the line with a $6,999 and a $7,001 test.**

---

# GATE 3 — THE MONEY IS PROVABLE. Days 4–7.

### 3.1 · Bank categorization queue
**8 of 395 categorized. December 8 2025 through today.** This is the largest block of work on the whole list and most of it is your decisions, not code. The month's real expenses you are about to enter will match against this feed — so the queue wants to exist before you have a hundred costs looking for their bank rows.
Build: suggest-never-post, bulk by merchant, remember a merchant decision so you are never asked twice, and record who decided and when.
**Seat: CC-3 builds. You categorize.**

### 3.2 · Proof trail — click to ledger
Given any money document, show the full chain: what was clicked, what was written, which accounts moved, every record it linked to. `trace_no` and `trace_key` already exist on every money table, so the spine is there.
This is what makes every other claim checkable by someone who does not trust the software.
**Seat: CC-2.**

### 3.3 · Three dates, never collapsed
`incurred` → load margin, settlement, P&L. `due` → cash flow, AP aging. `paid` → reconciliation only. Enforce on every money surface as they are built, not afterwards.
**Standing rule, every seat.**

---

# GATE 4 — SETTLE. Week 2.

### 4.1 · GO-22 spine, in order
Pre-settlement query service (`book-load.service.ts:2354` still logs `presettlement_link_deferred`) → settlement number generator → driver bill at creation → advance/liability overflow → home-base geofence and deadhead prompt → the blocking loan pop-up.

**The close rule:** tour = leave the Laredo yard, return to the Laredo yard. Closeable only inside the geofence with no load. **The southbound leg closes nothing.**

**The loan pop-up:** your 5% net-pay floor is **locked and answered** — 5% default, editable per settlement, Accept/Edit-amount control, and on termination the operator may override and deduct up to the full final check. Recovery order is **pay first, then escrow for the shortfall only, one charge per event.** `#19708` shipped full automatic recovery with no Accept/Edit control and no record of who chose — that is the gap.

**FUEL is a truck cost, never a driver settlement deduction.** A fuel *overage* is driver-fault and is recovered; a fuel-card *advance* is not. The code hold does not make that split.

### 4.2 · Company settlement table
No table exists. `TripProfitability.tsx` is a read view. Build the header keyed by settlement number with start and end dates plus child rows, eight sections per your own Settlement 5753, and a test that rebuilds 5753 from source records and ties the P&L to **2,415.11** exactly.
**Seat: CURSOR. Blocked on 2.1.**

---

# NOT NOW — and I want to be clear about why

These are real and they are on the register. **None of them stops you booking or accounting for a load**, so pulling a seat onto them now costs you days on the critical path.

| Deferred | Why it waits |
|---|---|
| Insurance L1–L9, GO-02, GO-03 | Whole module, no dispatch or accounting dependency. GO-03 is now unblocked and will keep |
| Boards, planners, trip pairing (E, F, G, H, I) | Cosmetic and layout. You book from the wizard, not the kanban |
| GO-07 KPI drill-through | Reporting. Wrong today (`atRiskCount + lateCount` double-counts) but it does not block entry |
| Deep links, 437 screens | Convenience |
| GO-05 raw tables outside dispatch and accounting | Do the ~10 screens you actually use; leave reports and program pages |
| J1 outside the wizard | The wizard alone is 162 of 1,015. Do those; the tail waits |
| The 10 half-built features | You already ruled: 6 need no table, 2 defer, 2 delete. Only workers-comp and cargo sensors are real gaps, and neither is dispatch or accounting |

---

# THE SHAPE OF IT

```
GATE 0   purge · reseed counter · drop B-        HOURS      <- blocks booking
─────────────────────────────────────────────────────────────
         YOU BOOK LOAD ONE
─────────────────────────────────────────────────────────────
GATE 1   pickers · B1 · Chrome-prove · B5 · numbers UI   DAYS 1-2
GATE 2   bills.driver_uuid · Costs tab · proforma · $7k   DAYS 2-4
GATE 3   bank categorization · proof trail · three dates  DAYS 4-7
GATE 4   GO-22 settlement spine · company settlement      WEEK 2
```

**Seats run in parallel across gates.** CC-1 on the purge and settlement spine. CC-2 on pickers, Chrome proof and the proof trail. CC-3 on the wizard and the categorization queue. Cursor on bills, proforma and numbering UI. Codex on the Costs tab.

---

## THE ONE THING I WOULD PUSH BACK ON

You said *"every single little and large fix"* before it functions perfectly.

I would not do that, and I think you would not either once you see the cost. Perfect-before-first-use means the first real load is weeks away, and **you will discover more from booking three real loads than from any audit any of us runs.** The defects that matter most are the ones you hit while working — and you cannot hit them until you work.

Gate 0 is three items because those three are the only ones that cannot be fixed after the fact. Everything else improves under you while you use it.

Book after Gate 0.

---

## FINDING — Cancel-load cascade (after Gate 0, CC-1)

Owner accepted Claude recommendation: default cascade **pre-checked**; list each linked record by **number** with checkbox; typed reason required if unchecked. File as CC-1 slice after Gate 0 purge — does not block purge.
