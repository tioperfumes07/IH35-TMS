# LEAD RULING — verify-control-totals "Driver settlements 5804-5815 net pay" baseline correction

The Lead (owner), 2026-09-27 ROUND 146, in direct chat:

> "YOUR BLOCKER IS A STALE BASELINE, NOT PROD DRIFT... I verified live: the true sum IS $21,893.54,
> and the $1,702.47 is EXACTLY settlement 5812. ROOT CAUSE: the guard's expected figure was derived
> from the STALE Company_Settlement_5812 export, which read Salary 0.00 / TOTAL DUE -50.00. The
> owner supplied the CORRECTED 5812 PDF on 09-28 and it reads Driver Salary 1,727.47 -- which is
> exactly what the app carries (gross 1,727.47, net 1,652.47). 20,191.07 + 1,702.47 = 21,893.54. To
> the cent. THE DATA IS RIGHT. THE BASELINE IS WRONG."

**ROUND 146 follow-up, same day, quoted in full:** "I verified the live sum myself, not from your
report... THE $1,702.47 IS SETTLEMENT 5812, EXACTLY: the STALE Company_Settlement_5812 export read
Salary 0.00 / Deductions -50.00 / TOTAL DUE -50.00; the app carries gross 1,727.47 / net 1,652.47;
1,652.47 - (-50.00) = 1,702.47; 20,191.07 + 1,702.47 = 21,893.54 -- to the cent... THE OWNER REPLACED
THAT DOCUMENT ON 09-28. UPDATED_Company_Settlement_5812 reads Driver Salary 1,727.47, loads 13588+
13600, Luis Armando Sosa Perez, Net Revenue 2,349.72. The app matches the corrected signed document
exactly. THE DATA IS RIGHT."

**Which fix was applied:** the guard derives its baseline from a hardcoded `expect:` literal in
`scripts/verify-control-totals.mjs`, not from a checked-in document set -- so the fix is editing that
literal (20191.07 -> 21893.54), not repointing a file reference.

## Independent verification (this session, live, `bypass_rls=lucia`, `tiny-field-89581227`)
```
SELECT COALESCE(SUM(s.net_pay),0) FROM driver_finance.driver_settlements
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND source_document_ref IN ('5804'..'5815')
-- 21893.54

Settlement 5812: gross_pay=1727.47, deductions_total=75.00, net_pay=1652.47, status=closed, voided_at=NULL
```
`20191.07 + 1702.47 = 21893.54` ties to the cent. 1652.47 net on 5812 ties to gross 1,727.47 less two
deductions (escrow 50.00 + the $25 escrow-balance-reconciles-gl correction, per the 09-26 journal),
consistent with the app carrying the corrected PDF's figures, not the stale export's.

## Ruling
`scripts/verify-control-totals.mjs`'s "Driver settlements 5804-5815 net pay" `expect` literal is
corrected from `20191.07` to `21893.54`. This is a baseline correction citing a superseded source
document (same class as the factoring-guard `cash_rsv_cents` fix earlier today, #22883) -- not a
plug, not a data change. No `driver_finance.*` row is touched by this ruling or the PR that carries
it.

**Authorized:** update the `expect` constant in `scripts/verify-control-totals.mjs` to `21893.54`,
citing this ruling in the constant's inline comment.
