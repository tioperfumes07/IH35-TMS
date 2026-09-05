# USMCA SEED — CONTAMINATION + CORRECTED SCOPE (Cursor lead, 2026-09-05 13:35Z)

**Owner ruling:** USMCA became operational **2026-08-07**. Any load **delivered before 08/07/2026 is TRANSPORTATION, not USMCA**. The prior seed instruction was wrong and pulled July/pre-operational Transportation loads into USMCA.

**Authoritative source of truth (the reconciled data):** `~/Downloads/IH35-BY-LOAD-20260904-WITH-DIESEL_1.xlsx`, sheet **"USMCA BY LOAD"** (Claude's four-way reconciliation: AlwaysTrack vs QuickBooks vs Faro USMCA vs Faro Transportation). USMCA = **36 loads**, delivery range 2026-08-10 → 2026-08-31, zero before 08/07. Settlements 5769, 5771–5787.

## MEASURED on Neon (USMCA 5c854333…, bypass_rls=lucia, soft_deleted_at IS NULL)
60 loads currently seeded into USMCA. Classified against the reconciliation:

### USMCA-OK — KEEP (22)
13508, 13510, 13511, 13514, 13516, 13518, 13519, 13521, 13523, 13526, 13529, 13534, 13538, 13543, 13545, 13546, 13547, 13548, 13549, 13550, 13552, 13557

### TRANSPORTATION CONTAMINATION — QUARANTINE (29) — never delete
13471, 13480, 13482, 13484, 13485, 13486, 13487, 13488, 13491, 13492, 13493, 13494, 13495, 13496, 13497, 13498, 13499, 13500, 13503, 13504, 13506, 13509, 13517, 13524, 13527, 13531, 13533, 13539, 13540
- These are on the reconciliation's **TRANSPORTATION BY LOAD** sheet (July deliveries, pre-operational).
- Remediation = reverse every posting on each load's chain (expenses, bills, driver_bills, settlement_lines, JEs) through the **existing void/reversal service** (VOID = reversal, never DELETE), then mark the rows `is_sample_data=true` with a memo `TRANSPORTATION-NOT-USMCA-2026-08-07-CUTOFF`. Owner opening balances stay $0.

### UNKNOWN — VERIFY before keep (9)
13558, 13559, 13560, 13561, 13562, 13565, 13566, 13567, 13568
- Not in the 2026-09-04 reconciliation. 13559/13560/13562 appear on the "DIESEL — LOAD NOT IN EXPORT" sheet (settlements 5791/5792) — likely late-Aug/Sep USMCA not yet in the export. Do NOT keep until confirmed against a refreshed reconciliation or the owner.

### USMCA MISSING — SEED (14)
13512, 13513, 13520, 13528, 13532, 13535, 13536, 13537, 13541, 13542, 13544, 13551, 13554, 13556
- Legitimate USMCA loads from the reconciliation not yet seeded. Seed from the reconciliation rows only (addresses/dates from the signed settlement documents; R1 lumper-vendor=delivery/cash, R2 missing-customer-created-from-document still apply).

## CORRECTED SEED RULE (standing)
1. A load enters USMCA **only** if it is on the "USMCA BY LOAD" sheet of the current reconciliation. Delivery ≥ 2026-08-07 is necessary but the reconciliation entity column is the authority.
2. Never seed a load that appears on "TRANSPORTATION BY LOAD".
3. Dates come from the load's own settlement document, not today's date.
4. Void/quarantine, never delete. Report the reversing JE id + the quarantined row id per load.
