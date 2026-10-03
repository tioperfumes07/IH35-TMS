# CURSOR — ROUND 172 (Updated) — LEAD RETRACTS JOB 2. ALL FOUR ARE HOLDS.
Issued 2026-09-28, Laredo Central. Supersedes 09-28-2026-Cursor-ROUND-172-FARO-ADVANCE-FEED-RULED.md.

## RETRACTION — READ THIS FIRST
In the prior box I told you to correct load 13619 to ONPOINT/34217 and 13615 to SEM66529, then feed
Faro 098 and 095. **DO NOT DO THAT. I was wrong to rule from AlwaysTrack alone.** CC-1 challenged it
and was right to. Evidence below. Nothing in Job 2 of the prior box is to be executed.

## WHAT THE SOURCES ACTUALLY SAY — all four re-measured

### Faro (CONTROL) — `~/Downloads/faro daily purchase report.csv`
Faro separately purchased, on their own invoices:
- inv **087**, 09/21/2026, PO `SEM66538`, Semares, $4,900.00
- inv **059**, 09/08/2026, PO `1013272-2`, Refrigerx, $5,210.00
  (NOTE: line 58 of the CSV has Faro's own Inv# and PO columns swapped — the raw line is
  `"Refrigerx...","09/08/2026","1013272-2","059",...`. One row of 100. Every other row parses
  clean, so the control totals are unaffected. Do not "fix" the file; read it as invoice 059.)

So `SEM66538` and `1013272-2` — the WOs Neon currently has on 13615 and 13619 — are each already
funded by their own Faro invoice. CC-1's objection is correct on this point.

### Rate confirmations (signed source) — found and read
- **`loads_5647973.pdf`** — RATE CONFIRMATION **SEM66529**, dated Sep 16 2026, $4,900.00.
  S.E. MARES INC, 1901 Shea St, Laredo TX 78040 → **Global Manufacturing, Inc., 980 New Durham Rd,
  Edison NJ 08817**. Deliver Fri Sep 18 @ 08:00.
- **`loads_5650227.pdf`** — ONPOINT LOGISTICS, PRO # **34217**, 09/22/26, $4,400.00, 1593 miles,
  **Truck T152, Trailer 10202, Driver GENARDO**. MISFITS MARKET BWI, 7481 Coca Cola Dr #100,
  **HANOVER MD 21076** (pick 09/22 12:00) → MISFITS MARKET SAT, 6903 NE Loop 410,
  **SAN ANTONIO TX 78219** (deliver 09/25 09:00).
- **`loads_5645316.pdf`** — PRO # **66607** is **HAWKEYE TRANSPORTATION SERVICES INC**, $6,800.00,
  Laredo Cold Storage → B&B Trading, **STOUGHTON MA**. It is NOT Refrigerx and NOT $5,700.

### Live Neon — the rows in question are PLACEHOLDERS
```
13613 | wo 1013583-2 | Refrigerx | T164 | LAREDO, TX (pickup) -> LAREDO, TX (delivery)
13615 | wo SEM66538  | Semares   | T177 | LAREDO, TX (pickup) -> LAREDO, TX (delivery)
13619 | wo 1013272-2 | Refrigerx | T152 | LAREDO, TX (pickup) -> LAREDO, TX (delivery)
13616 | po 66607     | Refrigerx | T171 | Laredo, TX (pickup) -> QUAKERTOWN, PA (delivery)
13638 | po 56713     | Semares   | T176 | Laredo, TX (pickup) -> EDISON, NJ (delivery)
```
**13613, 13615 and 13619 have Laredo → Laredo lanes.** That is not a real trip. Their stop data was
never imported. A row with a placeholder lane cannot be used to prove or disprove a PO mapping.

## THE THREE CONTRADICTIONS, NAMED

**C-1 — 13619.** AlwaysTrack (both reports) says 13619 = ON POINT LOGISTICS, 34217, HANOVER MD →
SAN ANTONIO TX, **T152**, settlement 5817. The rate con independently confirms 34217 = T152,
Hanover MD → San Antonio TX, $4,400. **Truck, lane, amount and reference all match AlwaysTrack.**
But Neon's 13619 row carries WO `1013272-2`, which Faro funded separately on inv 059 at $5,210,
and its lane is a Laredo→Laredo placeholder. Both cannot sit on one load number.

**C-2 — 13615.** Report 79 says SEM66529 = Semares, **T177**, 13615, $4,900. Neon 13615 is T177 —
truck matches — but carries WO `SEM66538`, which Faro funded separately on inv 087, and its lane is
a Laredo→Laredo placeholder. The SEM66529 rate con is Laredo → Edison NJ.

**C-3 — 13616.** Report 79 says `66607 | Refrigerx | T171 | 13616 | 5700`. The signed rate con for
PRO 66607 is **Hawkeye Transportation, $6,800, Laredo → Stoughton MA**. Neon 13616 is Refrigerx,
PO 66607, Laredo → Quakertown PA. **Three sources, three different answers.** This kills CC-1's
proposed 100 → 13616 mapping, which rested on amount + issue date, not on a PO match.

## RULING — ALL FOUR ON HOLD. FEED NOTHING FROM THIS SET.
- **095 / SEM66529 / $4,900 — HOLD**
- **098 / 34217 / $4,400 — HOLD**
- **100 / 10136752 / $5,700 — HOLD** (CC-1's 13616 match is date+amount only, and 13616 is itself contradicted)
- **102 / SEM66542 / $4,900 — HOLD**
- **099 / 2245258 / $2,400 — HOLD** (Neon PO exact, but Report 79 says 13609 = TTS LLC, WO 16465231, $2,500)

Do not force any of them. Do not edit a load header to make an advance fit. Booking $19,900 of
factoring against placeholder rows would put real money on the wrong loads.

## JOB 1 STANDS UNCHANGED — FEED THESE 6 NOW
| Faro inv | PO | Debtor | Purchase | Net Adv | Load |
|---|---|---|---|---|---|
| 094 | 16471804 | TTS LLC | 2,200.00 | 2,134.00 | 13622 |
| 096 | G4468456 | GREATWIDE TRUCKLOAD MANAGEMENT | 4,019.72 | 3,899.12 | 13617 |
| 097 | 1013809 | Refrigerx Transportation LLC | 3,700.00 | 3,589.00 | 13618 |
| 101 | 1777319 | Bennett International Logistics | 4,300.00 | 4,161.00 | 13620 |
| 103 | LGMX142 | LOGIMAX TRANSPORT INC | 6,250.00 | 6,062.50 | 13625 |
| 104 | 005804613 | FLS Transport Inc. | 3,400.00 | 3,298.00 | 13626 |
All six: PO exact in Neon, AlwaysTrack corroborates, no advance exists. Feed them, paste the rows.

## JOB 2 (NEW) — THE REAL DEFECT. THIS IS THE ROOT CAUSE, FIX IT BEFORE ANY MORE MAPPING.
Sweep every USMCA load for a **placeholder lane** — pickup city = delivery city = Laredo — and for a
`customer_po_number`/`customer_wo_number` whose signed rate confirmation in `~/Downloads/loads_*.pdf`
names a different customer or a different amount. Report the count and the list. Do not repair rows
in this PR; produce the register first.

Then a guard: refuse to attach a factoring advance to a load whose stop set is a placeholder
(single city, pickup city = delivery city) or whose PO does not string-match the advance's PO.

## THE MATCH LAW — UNCHANGED, AND THIS IS WHY IT EXISTS
An advance may be fed only when the PO string matches Neon exactly **AND** AlwaysTrack independently
puts that PO on that load **AND** the load has a real lane. Never amount + customer. Never
amount + date. Never load-number adjacency. One source agreeing is not a match — that is the
mistake I made in the prior box and I am correcting it here.

## CONTROL TOTALS — tie to these, do not re-derive
Through 09-21 = 89 invoices / $311,587.00 purchased / $302,019.36 net.
09-22 empty · 09-23 empty · 09-24 = 5 / $19,219.72 · 09-25 = 6 / $26,950.00.
Faro file total = 100 rows, 1 with swapped Inv#/PO columns (line 58, invoice 059).

---
# ADDENDUM — CC-1's 100 → 13616 IS REFUSED. 13616 IS A CORRUPTED ROW.

CC-1 argued: of the four unclaimed $5,700 Refrigerx loads (13588, 13613, 13616, 13639), only
13616's invoice issue_date (2026-09-25) matches Faro's purchase date for inv 100 (09/25/2026).
Therefore book it.

**Refused. Measured against the signed rate confirmations, which CC-1 did not read.**

The Laredo → Quakertown PA / Refrigerx / $5,700 lane has exactly TWO rate confirmations in
`~/Downloads`, and only two:
- `loads_5636303.pdf` — **Trip 1013583-2**, Order/PO 4504493857, 9/17/2026, Net Line Haul **5700**,
  810 Union Pacific Blvd Laredo TX 78045 → 1050 Heller Rd Quakertown PA 18951.
  → this is Neon **13613** (wo `1013583-2`), funded by Faro inv **092**, 09/21, $5,700. Already claimed.
- `loads_5656319.pdf` — **Trip 1013880-2**, Order/PO 4504497342 / 704622506N, 9/23/2026,
  Net Line Haul **5700**, same lane.
  → this is Neon **13639** (po `1013880-2`), currently dispatched.

**There is no third Quakertown rate confirmation.** But Neon 13616 carries that same lane
(Laredo, TX → QUAKERTOWN, PA), the same $5,700, customer Refrigerx — and PO `66607`.
PRO `66607`'s own signed rate con (`loads_5645316.pdf`) is **HAWKEYE TRANSPORTATION SERVICES INC,
$6,800.00, Laredo Cold Storage → B&B Trading, STOUGHTON MA**. Not Refrigerx. Not $5,700.
Not Quakertown.

**Conclusion: 13616 is a corrupted row — it carries 13613's lane and amount under a PO that belongs
to a Hawkeye load.** Booking Faro inv 100 ($5,700) onto it puts real factoring money on a row that
does not correspond to any signed document. An issue_date coincidence is not a match; that is
precisely the reasoning the match law forbids.

**100 stays on HOLD.** Open a defect: 13616 to be investigated as a duplicate/contaminated copy of
13613, and PO `66607` to be traced to the Hawkeye load it actually belongs to (Laredo → Stoughton MA,
$6,800) — which, note, does not appear in Neon at all under that reference.

## THE PATTERN NOW HAS FOUR MEMBERS
| Load | Neon says | Signed source / AlwaysTrack says |
|---|---|---|
| 13613 | wo 1013583-2, Refrigerx, **LAREDO → LAREDO** | rate con: Laredo → Quakertown PA, $5,700 — lane never imported |
| 13615 | wo SEM66538, Semares, **LAREDO → LAREDO** | Report 79: SEM66529, T177 — lane never imported |
| 13616 | po 66607, Refrigerx, Laredo → Quakertown, $5,700 | 66607 = Hawkeye, $6,800, Laredo → Stoughton MA |
| 13619 | wo 1013272-2, Refrigerx, **LAREDO → LAREDO** | rate con 34217: ONPOINT, T152, Hanover MD → San Antonio TX, $4,400 |

Three placeholder lanes and one foreign PO. This is a load-import defect, not a factoring-mapping
problem, and no amount of advance-matching cleverness will resolve it. **Build the register first.**
