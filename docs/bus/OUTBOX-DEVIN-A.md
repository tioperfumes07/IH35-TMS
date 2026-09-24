# OUTBOX-DEVIN-A · FEEDER #2 · 2026-09-24

## DEVIN-A | 2026-09-23 9:32 PM CT (2026-09-24 02:32Z) | FEEDER #2 DAY LIST POSTED | my_range=38/89

I own purchase days 09/06/2026 through 09/21/2026 inclusive. Cursor owns through 09/05 inclusive.
No overlap, no gap. Reconciliation: Cursor 51 invoices / $151,740.00 + Devin-A 38 invoices / $159,847.00 = 89 invoices / $311,587.00. ✓

### DAY LIST (per-day invoice count and dollar total)

| Purchase Day | Invoices | Purchase Total | Net Advance | Notes |
|-------------|----------|---------------|-------------|-------|
| 09/08/2026 | 6 | $23,910.00 | $23,182.70 | 1 wire ($10 fee) |
| 09/10/2026 | 2 | $3,100.00 | $2,997.00 | 1 wire ($10 fee) |
| 09/11/2026 | 7 | $33,400.00 | $32,388.00 | 1 wire ($10 fee) |
| 09/14/2026 | 7 | $30,770.00 | $29,836.90 | 1 wire ($10 fee) |
| 09/17/2026 | 2 | $7,600.00 | $7,362.00 | 1 wire ($10 fee) |
| 09/18/2026 | 7 | $28,300.00 | $27,441.00 | 1 wire ($10 fee) |
| 09/21/2026 | 7 | $32,767.00 | $0.00 | PURCHASED NOT FUNDED — net_adv=$0, no wire legs |
| **TOTAL** | **38** | **$159,847.00** | **$123,207.60** | |

### RECONCILIATION PROOF

```
Cursor (through 09/05): 51 invoices, $151,740.00
Devin-A (09/06-09/21):  38 invoices, $159,847.00
TOTAL:                  89 invoices, $311,587.00  ✓ matches owner's 89 / $311,587.00
```

### 09/21 STOP-AND-REPORT

09/21/2026 has net_adv=$0.00 on all 7 invoices. Faro purchased these invoices but has NOT funded them yet. Per the wire shape law: "A day's wire legs must sum to that day's net advance in the manifest." Net advance = $0.00 → zero wire legs. I will create the invoices and advances with faro_purchase_date=09/21 and status='submitted' (not 'advanced'), but NO cash receipt legs. When Faro funds these, the wire legs will be created then.

### WIRE SHAPE NOTE

All 6 funded days in my range show $10.00 in the "Fees" column (Faro's flat wire fee). Each day has exactly one $10 fee, indicating ONE wire per day (not two). I will create one cash receipt leg per funded day, matching the net_adv total. No second wire will be invented.

### EXISTING STATE (live Neon, bypass_rls=lucia, USMCA)

- 20 factoring advances exist (FAC-2026-00001 through 00020), all with NULL faro_purchase_date and NULL faro_invoice_number
- 21 loads exist (13508-13544, 90007), 21 invoices, 20 factored
- These are Cursor's rows (through 09/05). My rows start from FAC-2026-00021 onward.
- My loads/invoices do not exist yet — I will create them, resolving customers by natural key (REUSE).
