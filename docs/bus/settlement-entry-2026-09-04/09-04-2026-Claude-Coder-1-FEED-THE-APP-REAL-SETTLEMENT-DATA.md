# 09-04-2026 · CLAUDE CODER 1 · FEED THE APP THE REAL SETTLEMENT DATA

**Owner order 2026-09-04:** *"I want the loads uploaded, expenses created, bills, payments etc — everything related to the settlements — so we now have real and true data fed into our app."*

This is not a seeding exercise and it is not test data. It is **six weeks of a real carrier's operations**, off 37 signed documents, entered through the same screens the owner uses. Every refusal along the way is a defect worth more than the data itself.

**Entity: USMCA on all 37**, per the owner's ruling that IH35 Transportation is not operating.
**`is_sample_data = false` on every record.** These are real.

---

## 1. WHAT EXISTS TO BE CREATED — THE FULL INVENTORY

Parsed from `Company_Settlement_5753` and `5760`–`5795` plus the 37 matching `Driver_Settlement` files. Every settlement foots to its own printed FUEL PURCHASES total, its own printed EXPENSES total, and its own printed TOTAL DUE. Zero mismatches.

### Masters
| Object | Count | Detail |
|---|---|---|
| Customers (brokers) | **51** | already in `mdata.customers` — match, never create a duplicate |
| Drivers | **15** | ALFONSO HIDALGO CHAVEZ, Angel Alfonso Sosa Perez, Concepcion Cordova Dominguez, Genaro Guerrero Chavez, HUGO GAYTAN SARABIA, … |
| Units (tractors) | **15** | T144, T147, T148, T152, T156, T163, T164, T168, T170, T171, T173, T174, T175, T176, T177 |
| Trailers | **28** | |
| Vendors | **23** | LOVES, PILOT, FLYING, BLUE BEACON, CAT SCALE, FUEL AMERICA, SOAKERZ, TEN STAR TRUCKWASH, THORNTON, VALERO, TYSON, SR FORWARDING, CONTINENTAL, DTOPS, INDIANA TOLL ROAD, PALOS GARZA, FRONTIER TRUCK, … |

### Operations
| Object | Count |
|---|---|
| **Loads** | **81** |
| **Stops / legs** | **229** — every one with the distance travelled to reach it |

### Money
| Object | Count | Amount |
|---|---|---|
| Customer invoices — line haul | 79 | **$263,708.00** |
| Diesel expenses | **180** | **$119,550.30** |
| Other company expenses | **201** | **$8,868.44** |
| Driver bills — per mile | 78 | $52,475.09 |
| Driver bills — flat rate override | 3 | $600.00 |
| Additional pay lines | 47 | $1,557.00 |
| Reimbursements to driver | 36 | $878.58 |
| Deduction lines | 103 | $-4,116.21 |
| Driver settlements | **37** | **$51,394.46** |
| Company settlements | **37** | |

**About 1,111 records in total.**

### The 201 other company expenses, by kind

| Kind | Amount |
|---|---|
| DEF | $4,308.25 |
| Tire / road service | $1,757.84 |
| Reefer diesel | $1,107.83 |
| Trailer / truck washout | $536.38 |
| Scale | $458.50 |
| Other — description blank on the PDF | $452.84 |
| Lumper | $224.80 |
| Toll | $22.00 |

**Every diesel purchase has a paired DEF line on the same invoice number, same vendor, same date.** 123 of the 201 are DEF. They are two lines on one receipt, not one line — create both, linked by the invoice number.

---

## 2. THE ORDER OF CREATION — EACH STEP DEPENDS ON THE ONE BEFORE IT

1. **Masters first.** Match every customer, driver, unit, trailer and vendor to what already exists. **Never create a duplicate.** USMCA already holds 1,232 customers, 603 vendors and the 15 drivers. `Simple Logistics` / `Simplex logistics` / `Silo Simple Logistics` are three separate rows and stay three — file the duplicate question, do not merge.
2. **Loads, with their stops.** Addresses, dates, customer, driver, unit, trailer. **Addresses only — let the engine route.**
3. **Customer invoices** — line haul per load, at the settlement's own rate.
4. **Expenses and bills** — every diesel purchase, every DEF line, every scale, washout, toll, tire, lumper, each attached to its load and its vendor, each with its real invoice number.
5. **Driver bills** — two lines, loaded and deadhead, at the settlement's rates.
6. **Additional pay, reimbursements, deductions** — each on its own row, tied to its load.
7. **Pre-settlement per tour, then close it.** Closing is settling.
8. **Payments** — only where the signed document shows one. **Never invent a payment.**

---

## 3. THE RULES — NON-NEGOTIABLE

**Through the real UI write path.** Not a SQL script, not a seed file, not a bulk INSERT. If a screen cannot create the record, **that is the defect and it gets fixed** — that is why we are doing this.

**Stop at the first refusal and report it.** A load that will not save, an expense with no category, a settlement that will not close — each is a finding worth more than the row. **Do not hand-INSERT past it.**

**Addresses only. Never type a mileage that came off the settlement.** The engine routes; we then measure it against PC\*MILER in `IH35-MILEAGE-ENGINE-vs-PCMILER-2026-09-04.xlsx`. A typed mileage makes that comparison read perfect and prove nothing.

**Nothing consolidated.** 180 diesel rows, not 37 fuel totals. 201 expense rows. 103 deduction rows.

**Real invoice numbers.** Every fuel and expense row carries the vendor's own invoice number off the receipt. Two numbers on every vendor document — ours and theirs.

**Escrow accrues $25.00 per load.** 58 lines, every one exactly −$25.00.

**`is_sample_data = false`.** These are real records of a real carrier.

**Never invent a payment, a date, an address or an amount.** If the document does not say it, it does not go in. The one authorized correction is settlement 5789 / load 13557 / invoice 99462408, printed `2026-09-29`, loaded as `2026-08-29` — outside its own settlement period and off the truck's route as printed. Record the correction on the row.

---

## 4. THE SIX THE OWNER ENTERS BY HAND — DO NOT TOUCH THEM

**5766 · 5772 · 5776 · 5780 · 5783 · 5784** — 15 loads. They are the control group and they carry the hard cases: flat-rate override, a 351.6-mile unpaid run home, four R&M lines on one load, five stops on one load, cash advance plus layover, and a legitimately-zero deadhead.

**You create the other 31 settlements — 66 loads.**

---

## 5. WHAT THIS WILL BREAK — EXPECT IT, REPORT IT, DO NOT WORK AROUND IT

- **The category picker is missing ten accounts.** `LoadDetailCostsTab.tsx:100` filters `/expense|cost of goods/i` against `account_type`; the live type is `CostOfGoodsSold` with no spaces, so it never matches. `5000 Fuel & Diesel` is excluded and `+ Fuel advance` is dead. **You cannot create a single diesel expense until this is fixed.** It is item one.
- **Loads will land in `draft`.** 13508 already has. The Edit Load PATCH advances no status, and a draft never reaches the Load Costs board.
- **Empty miles will come up short on 17 loads.** The run home — 5,524.2 mi, 51.8% of all deadhead — is never measured.
- **`mdata.load_stops` has no mileage column**, so a multi-drop load cannot store its legs. 5784/13528 is 512.9 + 29.2 = 542.1.
- **Escrow will post $250 per settlement** instead of $25 per load.
- **Three loads pay a flat rate with no mileage at all.** If the override path does not exist, say so rather than approximating it.

---

## 6. REPORT BACK

One line per settlement: created, or refused and why. Then the totals against these figures:

```
loads 81 · stops 229 · line haul $263,708.00 · diesel $119,550.30 (180 rows)
other expenses $8,868.44 (201 rows) · driver pay $52,475.09 · additional $1,557.00
reimbursed $878.58 · deductions -$4,116.21 · total due drivers $51,394.46
```

And the mileage comparison — our engine against PC\*MILER — in miles, percent and dollars, from the BY LOAD TOTAL row of the workbook.

**Merged is not done. Rows in a table are not done. Done is the owner opening Load Costs and seeing six weeks of his own real operations, footing to the signed documents.**
