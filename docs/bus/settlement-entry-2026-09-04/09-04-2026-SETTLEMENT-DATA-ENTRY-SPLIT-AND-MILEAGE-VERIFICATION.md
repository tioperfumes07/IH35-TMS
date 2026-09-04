# 09-04-2026 · SETTLEMENT DATA ENTRY — THE SPLIT, AND THE MILEAGE VERIFICATION

**Owner order 2026-09-04:** *"You have company and driver settlements, you can instruct coders to create them. Just leave a few of there are with multiple stops or with issues or repairs etc for me. And I will do those manual to test them out. So we can find any issues etc. and on those loads you verify and reports the difference in miles etc."*

Source: 37 signed Company Settlements and the 37 matching Driver Settlements, `5753` and `5760`–`5795`, 2026-07-24 → 2026-09-03.
**81 loads · 229 legs · 180 diesel purchases · 15 drivers · $263,708.00 line haul · $119,550.30 diesel · $51,394.46 total due drivers.**

**Entity:** all USMCA, per the owner's ruling that IH35 Transportation is not operating. The AlwaysTrack letterhead and its TRANSPORTATION load tags are the legacy carrier record, not the operating entity.

---

## 1. THE SPLIT

| | Settlements | Loads | Who |
|---|---|---|---|
| **Coders create** | 31 | 66 | CC-1, through the real UI write path |
| **Owner enters by hand** | 6 | 15 | the complex ones, to find what breaks |
| **Total** | 37 | 81 | |

## 2. THE SIX THE OWNER ENTERS BY HAND — AND WHY EACH ONE WAS CHOSEN

| Settl | Driver | Unit | Loads | Fuel stops | What it tests |
|---|---|---|---|---|---|
| **5766** | Rafael Rogelio Rivero Reynoso | T148 | 1 | 2 | **Flat rate override** on a single load, and a 351.6-mile run home that is paid NOTHING. The smallest hard case. |
| **5772** | PEDRO ABRAHAM LOPEZ COLLADO | T152 | 4 | 6 | **Cash advance + layover + R&M** across 4 loads on one truck. Also the only settlement where the fuel date-window and the printed load assignment disagree. |
| **5776** | Leonel Antonio Morales | T147, T175 | 3 | 7 | **Four R&M lines on one load** (13515) — the most repair rows anywhere. Two trucks in one settlement, T147 and T175. |
| **5780** | Rafael Rogelio Rivero Reynoso | T148 | 2 | 1 | **Both loads flat rate.** 160.3 pre-pickup empty miles paid at no rate. Tests the override path end to end. |
| **5783** | Jorge Luis Infante Corona | T177 | 2 | 4 | **Five stops on one load** (13537), two deliveries, a run home, and a pickup at the same city as the prior delivery so the deadhead is legitimately zero. |
| **5784** | JOSE ANTONIO VICENTE MARTINEZ | T171 | 3 | 8 | **Everything at once** — 2-drop, 2 R&M washouts, a run home, extra-delivery pay, 8 fuel stops, three per-load escrow lines. This is the reference case. |

## 3. MILEAGE VERIFICATION ON THE HAND-ENTRY SET

The company settlement bills the customer on **PRACTICAL** miles. The driver settlement pays on **SHORTEST**. They are two different route solutions from the same address pair, not a factor of each other.

```
Settl   Load  Unit  Cust(prac)  Loaded(sh)    Empty    DrvTot     Diff   Ratio  legs
----------------------------------------------------------------------------------------------------------------------
 5766  13501  T148       757.0           -        -         -    757.0    FLAT  Pick Deli/351.7 Empt/351.6
 5772  13502  T152     1,114.9     1,079.7        -   1,079.7     35.2  1.0326  Pick Deli/1079.7
 5772  13507  T152       535.4       414.2     93.7     507.9     27.5  1.0541  Empt Pick/93.7 Deli/414.2
 5772  13512  T152       954.2       716.8    222.0     938.8     15.4  1.0164  Empt Pick/222.0 Deli/716.8
 5772  13513  T152       552.0       436.1    108.2     544.3      7.7  1.0141  Empt Pick/108.2 Deli/436.1
 5776  13505  T147     1,306.0     1,292.4        -   1,292.4     13.6  1.0105  Pick Deli/1292.4
 5776  13515  T175       476.1       426.8     36.6     463.4     12.7  1.0274  Empt Pick/36.6 Deli/426.8
 5776  13520  T175       929.7       897.6     21.9     919.5     10.2  1.0111  Empt Pick/21.9 Deli/897.6
 5780  13530  T148       354.4           -        -         -    354.4    FLAT  Pick Deli/320.7
 5780  13532  T148       590.3           -        -         -    590.3    FLAT  Empt Pick/160.3 Deli/409.6
 5783  13535  T177     1,958.9     1,890.2        -   1,890.2     68.7  1.0363  Pick Deli/1890.2
 5783  13537  T177     1,981.3     1,586.6    335.7   1,922.3     59.0  1.0307  Empt Pick Deli/1548.4 Deli/38.2 Empt/335.7
 5784  13522  T171     1,364.8     1,319.0        -   1,319.0     45.8  1.0347  Pick Deli/1319.0
 5784  13528  T171       713.0       542.1    121.6     663.7     49.3  1.0743  Empt Pick/121.6 Deli/512.9 Deli/29.2
 5784  13536  T171     1,911.8     1,607.9    276.7   1,884.6     27.2  1.0144  Empt Pick/81.1 Deli/1607.9 Empt/195.6
----------------------------------------------------------------------------------------------------------------------
TOTAL                 (flat excluded)    13,798.1    12,209.4  1,216.4  13,425.8    372.3  1.0277
```

**On the hand-entry set:** customer **13,798.1** practical miles against driver **13,425.8** short miles — a difference of **372.3 mi, 2.77%**. Ratio min 1.0105, median 1.0290, max 1.0743.

**Across all 37 settlements:** customer **111,810.1** against driver **110,263.8** — **1,546.3 mi, 1.40%**. Ratio min **0.7790**, median **1.0279**, max **1.0748**, and **5 of 76 loads have practical SHORTER than shortest.** There is no factor. Two route calls, two stored values.

## 4. WHAT THE HAND-ENTRY SET WILL EXPOSE

**(a) The run home is not paid, and on flat-rate loads no empty mile is paid at all.**
Across the 37: 5,139.3 empty miles ran to the load and **5,524.2 ran home — 51.8% of all deadhead.** The app measures none of it; `tour-close.service.ts` closes the tour and writes no mileage and no pay line. On the three flat-rate loads a further **511.9 empty miles** carry no mileage rate at all — 5766/13501 alone is a **351.6-mile run home for nothing**.

**(b) A multi-drop load must sum its delivery legs.** 5784/13528 pays 542.1 loaded = 512.9 + 29.2 across two deliveries. 5783/13537 pays 1,586.6 = 1,548.4 + 38.2. If the app stores one distance per load it cannot reproduce either.

**(c) A zero deadhead can be legitimate.** 5783/13537 empties at Edison NJ and picks up at Edison NJ the same day — same city, so the Pickup line carries no miles and only the 335.7-mile run home is paid. That is correct, not a defect. The app must distinguish *zero because it is genuinely zero* from *blank because we could not measure it*.

**(d) Escrow is per load.** 5784 carries three $25.00 escrow lines for three loads. The app accrues $250 per settlement.

**(e) One date anomaly, do not silently correct it.** Settlement 5789 prints a fuel purchase dated **2026-09-29** inside an August settlement. That is what the signed document says. Flag it, load it as printed, and let the owner rule.

## 5. THE 31 THE CODERS CREATE

| Settl | Driver | Unit | Loads | Fuel | Line haul | Diesel | Total due |
|---|---|---|---|---|---|---|---|
| 5753 | Neftali Coronado Urbano | T175, T176 | 2 | 5 | $8,100.00 | $3,491.92 | $1,987.95 |
| 5760 | JORGE FLORES VALADEZ | T144 | 2 | 3 | $6,720.00 | $2,661.72 | $1,270.90 |
| 5761 | Leonel Antonio Morales | T171 | 2 | 6 | $6,139.00 | $3,101.36 | $1,484.85 |
| 5762 | Ruben Pedro Perez Garcia | T174 | 2 | 8 | $7,439.00 | $4,220.24 | $1,312.38 |
| 5763 | JOSE MIGUEL DE SANTIAGO PALACIOS | T164 | 2 | 3 | $7,600.00 | $2,482.28 | $1,057.84 |
| 5764 | Jorge Luis Infante Corona | T175, T177 | 2 | 5 | $8,900.00 | $3,779.49 | $2,019.30 |
| 5765 | Neftali Coronado Urbano | T176 | 2 | 5 | $8,900.00 | $3,032.07 | $2,029.30 |
| 5767 | JOSE ANTONIO VICENTE MARTINEZ | T168 | 2 | 5 | $7,100.00 | $2,673.68 | $1,267.70 |
| 5768 | HUGO GAYTAN SARABIA | T173 | 2 | 5 | $7,300.00 | $2,969.49 | $1,193.10 |
| 5769 | Angel Alfonso Sosa Perez | T156 | 2 | 2 | $6,300.00 | $1,278.22 | $1,095.52 |
| 5770 | Neftali Coronado Urbano | T176 | 2 | 5 | $9,300.00 | $3,221.70 | $1,997.50 |
| 5771 | Jorge Luis Infante Corona | T177 | 2 | 4 | $7,900.00 | $3,171.66 | $1,949.10 |
| 5773 | Concepcion Cordova Dominguez | T163 | 2 | 5 | $10,800.00 | $3,805.85 | $1,837.52 |
| 5774 | JOSE ANTONIO VICENTE MARTINEZ | T171 | 2 | 3 | $7,800.00 | $2,519.78 | $1,107.42 |
| 5775 | ALFONSO HIDALGO CHAVEZ | T164 | 3 | 6 | $7,300.00 | $3,207.40 | $1,186.40 |
| 5777 | Jorge Luis Infante Corona | T177 | 2 | 4 | $8,400.00 | $3,369.65 | $1,948.00 |
| 5778 | HUGO GAYTAN SARABIA | T173 | 2 | 5 | $4,200.00 | $3,557.34 | $1,245.26 |
| 5779 | LUIS ARMANDO SOSA PEREZ | T170 | 2 | 6 | $6,500.00 | $3,299.57 | $1,387.66 |
| 5781 | Leonel Antonio Morales | T175 | 2 | 5 | $6,700.00 | $2,385.97 | $1,220.31 |
| 5782 | HUGO GAYTAN SARABIA | T173 | 2 | 4 | $7,020.00 | $3,301.67 | $1,456.86 |
| 5785 | Genaro Guerrero Chavez | T152 | 3 | 6 | $7,600.00 | $4,570.14 | $1,246.68 |
| 5786 | Concepcion Cordova Dominguez | T163 | 2 | 4 | $5,750.00 | $2,418.24 | $1,039.05 |
| 5787 | ALFONSO HIDALGO CHAVEZ | T164 | 2 | 3 | $4,180.00 | $1,990.55 | $885.73 |
| 5788 | Angel Alfonso Sosa Perez | T156 | 3 | 8 | $8,960.00 | $4,671.26 | $1,273.90 |
| 5789 | Jorge Luis Infante Corona | T177 | 2 | 5 | $8,800.00 | $3,799.29 | $2,015.85 |
| 5790 | Leonel Antonio Morales | T175 | 2 | 6 | $4,000.00 | $3,806.68 | $1,452.75 |
| 5791 | HUGO GAYTAN SARABIA | T173 | 2 | 5 | $9,200.00 | $3,840.27 | $1,630.03 |
| 5792 | Genaro Guerrero Chavez | T152 | 3 | 5 | $9,600.00 | $3,792.70 | $1,386.05 |
| 5793 | Neftali Coronado Urbano | T176 | 2 | 6 | $5,100.00 | $3,942.23 | $1,568.91 |
| 5794 | JOSE ANTONIO VICENTE MARTINEZ | T171 | 2 | 6 | $7,500.00 | $3,707.91 | $1,330.60 |
| 5795 | LUIS ARMANDO SOSA PEREZ | T170 | 2 | 4 | $5,550.00 | $2,684.35 | $789.04 |

## 6. HOW THE CODERS CREATE THEM — NON-NEGOTIABLE

1. **Through the real UI write path**, the same one the owner uses. Not a SQL script, not a seed file. If the path cannot create it, that is the defect and it gets fixed — that is the point of the exercise.
2. **`is_sample_data = false`.** These are real historical records of a real carrier, not test data.
3. **Every load, every stop, every individual diesel purchase, every deduction as its own row.** Never a consolidated Fuel figure.
4. **Two mileage values per loaded route** — practical to `miles_practical`, shortest to `miles_shortest`. Type both from the settlement; do not derive one from the other and never apply a factor.
5. **Stop at the first refusal and report it.** A settlement that will not save is a finding, not something to work around. Do not hand-INSERT to get past it.
6. **Foot every settlement to its printed total** and paste the comparison. Salary + Additional + Reimbursed − Deductions = TOTAL DUE.
7. **Never touch the six hand-entry settlements.** They are the owner's control group.
