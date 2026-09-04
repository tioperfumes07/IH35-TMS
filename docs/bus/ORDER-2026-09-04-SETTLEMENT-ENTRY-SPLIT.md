# ORDER 2026-09-04 — FEED THE APP REAL SETTLEMENT DATA (CC-1)

**Status:** BINDING. Owner order 2026-09-04. Supersedes every earlier settlement-entry instruction on this bus, including the “type both mileages,” “ask which loads are live,” and “close the pre-settlement” lines.

**Packets (in-repo — pull tip):**
- `docs/bus/settlement-entry-2026-09-04/09-04-2026-Claude-Coder-1-FEED-THE-APP-REAL-SETTLEMENT-DATA.md`
- `docs/bus/settlement-entry-2026-09-04/09-04-2026-SETTLEMENT-DATA-ENTRY-SPLIT-AND-MILEAGE-VERIFICATION.md`
- `docs/bus/settlement-entry-2026-09-04/IH35-SETTLEMENT-TIEOUT-2026-09-04.xlsx`
- `docs/bus/settlement-entry-2026-09-04/IH35-MILEAGE-ENGINE-vs-PCMILER-2026-09-04.xlsx`

**Owner quote:** *"I want the loads uploaded, expenses created, bills, payments etc — everything related to the settlements — so we now have real and true data fed into our app."*

This is **not** seeding and **not** test data. Six weeks of a real carrier’s operations off 37 signed documents, entered through the same screens the owner uses.

**Entity:** **USMCA on all 37.** IH35 Transportation is not operating. AlwaysTrack letterhead / TRANSPORTATION tags = legacy carrier record only.

**`is_sample_data = false` on every record.**

---

## THE SPLIT

| Who | Settlements | Loads | Job |
|---|---|---|---|
| **CC-1** | **31** | **66** | Create through real UI; fill TIE-OUT + ENGINE workbooks |
| **Owner / Cursor control** | **6** | **15** | Hand-enter later — **DO NOT TOUCH** |
| **Total** | **37** | **81** | `5753` + `5760`–`5795` |

**CC-1 creates:**
```
5753, 5760, 5761, 5762, 5763, 5764, 5765,
5767, 5768, 5769, 5770, 5771,
5773, 5774, 5775,
5777, 5778, 5779,
5781, 5782,
5785, 5786, 5787, 5788, 5789, 5790, 5791, 5792, 5793, 5794, 5795
```

**DO NOT TOUCH (owner control — 15 loads):** `5766, 5772, 5776, 5780, 5783, 5784`

---

## OWNER RULINGS THAT CHANGE THE JOB (later wins)

### RULING A — DO NOT CLOSE ANY SETTLEMENT
> *"do not close them leave them all in presettlements I will close one by one."*

**Step 7 = create the pre-settlement per tour and STOP.**  
Never call close. Never post settlement JEs. Never advance to Settlement.

- **31 pre-settlements OPEN** (“Open - not closed”)
- **0 closed**
- **0 journal entries** from a settlement close
- Pre-settlements tab shows all 31 with **Close** live and untouched
- Settlements tab stays empty until the owner starts closing

Closing freezes the settlement, posts JEs, and cannot be reversed. If you close even one you destroy his one-by-one close test.

### RULING B — NO OPEN LOADS IN THIS DATA (supersedes “ask which are live”)
The owner downloaded **settlements only**. All 37 are settled documents → **all 81 loads are COMPLETE**. Enter every load as complete. Do not leave mid-trip statuses. Do not ask which loads are still running — answer is **none of these**.

Trucks rolling now (T152 / T168 / T156 as of 2026-09-04 23:35Z) are on loads **not** in this set. Those get booked live later. Better test.

### RULING C — 5789 fuel date
Settlement **5789** / load **13557** / LOVES invoice **99462408** / **146.879 gal @ $5.719 = $840.00** at 10465 LONESOME PINE TRAIL M, TN.  
Printed `2026-09-29` → **load as `2026-08-29`** with visible memo:  
`Date corrected from 2026-09-29 as printed to 2026-08-29; outside settlement period and off the truck's route as printed. Owner ruled 2026-09-04.`  
**Only** authorized date correction. Money unchanged.

### RULING D — Mileage is an ENGINE TEST
**ENTER ADDRESSES ONLY.** Never type a settlement / PC\*MILER mileage. Engine routes; paste engine output into yellow columns of the ENGINE workbook. Typed miles make Diff = 0 and prove nothing.

---

## ITEM ZERO — FIX BEFORE ANY DIESEL ROW (blocks the whole money path)

`apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx` (~line 100) filters `/expense|cost of goods/i` against `account_type`. Live type is **`CostOfGoodsSold` (no spaces)** — never matches. Ten cost accounts invisible; **5000 Fuel & Diesel** excluded → **not one diesel expense can be created**.

**Fix:** match the real type (include `CostOfGoodsSold`). Bind the fuel account **BY ROLE** in `accounting.chart_of_accounts_roles`, never by name regex.

Ship that fix + guard before creating expense rows.

---

## ITEM ZERO-B — FIX BEFORE THE OWNER STARTS CLOSING

`tour-close.service.ts` requires the truck **inside the Mines Rd yard geofence** with no load. Verified across all 37 signed settlements, tours end two legitimate ways:

| Type | Count | How the tour ends | Deadhead paid? |
|---|---|---|---|
| **A** | 18 | Explicit Empty leg to **EBT Yard, Laredo, TX 78045** | YES — that leg is paid |
| **B** | 19 | Final delivery **inside Laredo** (Palos Garza, MS Worldwide, Continental Forwarding, Sr Forwarding, Esquivels, Longhorn, Imex, Cavazos, Al-Com, Hinojosa Calzado, …) | NO — no run-home leg |

All 19 type-B ended in Laredo. Zero ended out of state. Both A and B are a closed tour — truck came home either way.

Enforced literally, the app **cannot close more than half his history**. He is about to close them one at a time.

**Rule must be:** tour closes when the truck is **HOME IN LAREDO WITH NO LOAD** — satisfied by **yard geofence OR a completed final delivery inside Laredo**. Keep “no active load.” Widen location.

**Money difference is real — preserve it:**
- Type-A close → pays the deadhead leg to the yard
- Type-B close → pays none  
Do **not** invent a run-home on type-B. Do **not** drop the paid one on type-A.

**Guard:** `verify-tour-closes-on-laredo-delivery-or-yard` — asserts both close paths; deadhead paid on A, absent on B; fails if geofence is the only accepted condition.

---

## CREATION ORDER (each step depends on the prior)

1. **Masters.** Match customers / drivers / units / trailers / vendors to what exists. **Never duplicate.** USMCA already has ~1,232 customers, ~603 vendors, the 15 drivers. `Simple Logistics` / `Simplex logistics` / `Silo Simple Logistics` stay three separate rows — file the duplicate question, do not merge.
2. **Loads with stops.** Addresses, dates, customer, driver, unit, trailer. **All COMPLETE.**
3. **Customer invoices** — line haul per load at the settlement’s own rate.
4. **Expenses and bills** — every diesel, every DEF (paired same invoice/vendor/date), every scale / washout / toll / tire / lumper; attached to load + vendor with **real invoice numbers**.
5. **Driver bills** — two lines (loaded + deadhead) at settlement rates. Flat-rate override on the three flat loads — if path missing, **say so**, do not approximate.
6. **Additional pay, reimbursements, deductions** — each own row, tied to load.
7. **Pre-settlement per tour — then STOP.** (RULING A)
8. **Payments** — only where the signed document shows one. With nothing closed, most have none. **Never invent a payment.**

---

## INVENTORY (footed — zero mismatches on all 37)

| Object | Count | Amount |
|---|---|---|
| Customers | 51 | match existing |
| Drivers | 15 | |
| Tractors | 15 | T144 T147 T148 T152 T156 T163 T164 T168 T170 T171 T173 T174 T175 T176 T177 |
| Trailers | 28 | |
| Vendors | 23 | |
| Loads | 81 | (you: 66) |
| Stops/legs | 229 | |
| Customer invoices (line haul) | 79 | **$263,708.00** |
| Diesel | **180** | **$119,550.30** |
| Other company expenses | **201** | **$8,868.44** |
| Driver bills — per mile | 78 | $52,475.09 |
| Driver bills — flat override | 3 | $600.00 |
| Additional pay | 47 | $1,557.00 |
| Reimbursements | 36 | $878.58 |
| Deductions | 103 | −$4,116.21 |
| Escrow | 58 | −$25.00 each (**per load**) |
| Driver settlements | 37 | **$51,394.46** (you: 31 open pre-settlements) |
| Company settlements | 37 | |

**201 other expenses:** DEF $4,308.25 (123) · tire/road $1,757.84 · reefer diesel $1,107.83 · washout $536.38 · scale $458.50 · lumper $224.80 · tolls $22.00 · other $452.84.

**Every diesel has a paired DEF line** on the same invoice number, vendor, date — two lines on one receipt.

---

## NON-NEGOTIABLE

1. **Real UI write path.** Not SQL, not seed, not bulk INSERT. If the screen cannot create it → that is the defect. Fix or stop and report. Do not hand-INSERT past it.
2. **Stop at first refusal and report it.**
3. **Addresses only for miles.** Engine routes. Paste engine output into ENGINE workbook yellow columns.
4. **Nothing consolidated.** 180 diesel rows, 201 expense rows, 103 deduction rows — not 37 totals.
5. **Real invoice numbers** on every fuel/expense row (ours + theirs).
6. **Escrow $25.00 PER LOAD** (58 lines at exactly −25.00). $250/settlement is a finding.
7. **`is_sample_data = false`.**
8. **Never invent** a payment, date, address, or amount.
9. **Never touch** 5766 / 5772 / 5776 / 5780 / 5783 / 5784.
10. **Never close** a pre-settlement.

---

## EXPECT THESE TO BREAK — REPORT, DO NOT WORK AROUND

- Loads land in `draft` and never reach the board
- Empty miles short on ~17 loads (run home 5,524.2 mi = 51.8% of deadhead never measured)
- `mdata.load_stops` has **no mileage column** → multi-drop cannot store legs (5784/13528 = 512.9 + 29.2 = 542.1)
- Escrow posts $250/settlement instead of $25/load
- Flat-rate override path missing on 13501 / 13530 / 13532
- Tour-close geofence-only rule (ITEM ZERO-B) — fix before owner closes

---

## TELEMATICS DEFECTS — FILE FOR CC-3, DO NOT FIX (CC-3 lane)

1. `telematics.vehicle_latest_position` holds **two rows per unit** for most units — should be one.
2. `city` / `state` / `formatted_location` **NULL on every row captured today** — reverse geocode not populating.
3. **T144** last report **2025-07-09** (14 months) yet ran settlement **5760** in July 2026 — dead Samsara link or unit gone.

---

## REPORT (OUTBOX-CC-1)

1. One line per settlement: `created-open-pre-settlement | refused + why`
2. Totals vs inventory above
3. Mileage comparison from BY LOAD TOTAL (mi, %, $)
4. Explicit: **31 pre-settlements OPEN · 0 closed · 0 close JEs**
5. ITEM ZERO + ITEM ZERO-B fix SHAs

**Done is** the owner opening Load Costs and seeing six weeks of his real operations footing to the signed documents — **and** opening Pre-settlements to 31 open rows he can close one by one. Rows in a table alone are not done.

**ACK:** `CC-1 | ACK | FEED-REAL-DATA 31 OPEN PRE-SETTLE · NEVER CLOSE · NEVER TOUCH 6 · ENGINE NOT TYPED MILES | GO`
