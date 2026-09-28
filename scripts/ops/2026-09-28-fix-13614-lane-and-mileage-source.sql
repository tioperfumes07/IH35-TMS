-- AUTH-098 — ROUND 155.23/157-A item 6: 13614's delivery stop was a literal copy of its pickup
-- stop (LAREDO,TX->LAREDO,TX on a 1,137.4-mile load is physically impossible). Real data read
-- from the signed settlement document (Driver_Settlement_5818.pdf, ~/Downloads): pickup Laredo,
-- TX; delivery CONLEY, GA 30288; loaded miles 1,111.6 @ $0.45/mi. Executed live via the Neon MCP
-- (SET LOCAL app.bypass_rls='lucia' in the same transaction). Recorded here for the shared file.

UPDATE mdata.load_stops
   SET city = 'CONLEY', state = 'GA', postal_code = '30288'
 WHERE id = 'e11e875a-0c5a-417a-988b-0cc6f3ecfa09'
   AND city = 'LAREDO' AND state = 'TX';

-- miles_shortest -> NULL, not another copy of practical: the document states only loaded miles,
-- no independently-sourced shortest figure exists (155.12 FIX 2's own "never invent shortest" rule).
UPDATE mdata.loads
   SET miles_practical = 1111.6, miles_shortest = NULL, loaded_miles = 1111.6, mileage_source = 'Manual'
 WHERE load_number = '13614'
   AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND mileage_source = 'History';
