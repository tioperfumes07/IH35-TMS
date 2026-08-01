-- ACCT-F73 — backfill accounting.bills.mdata_vendor_id (uuid) from the QBO vendor id.
--
-- WHY: mdata_vendor_id is NULL on ALL 16,246 bills (verified on prod 2026-08-01), so the canonical
-- uuid FK is useless to every consumer. vendor_id is TEXT holding the QBO id ("2", "256", "1093").
-- Anything reaching for the uuid column gets nothing — and swapping a query to it "looks" correct
-- while silently yielding nulls, which nearly shipped during SAF-F70.
--
-- DETERMINISM PROVEN BEFORE WRITING (not assumed): 16,243 of 16,246 bills match EXACTLY ONE
-- mdata.vendors row on (qbo_vendor_id, operating_company_id) — a GROUP BY ... HAVING count(*) > 1
-- returned zero rows, so no bill is ambiguous. 0 bills already have mdata_vendor_id set, so this
-- cannot contend with existing data.
--
-- PASS 1 — the QBO-id match (16,243 rows).
-- PASS 2 — one bill whose vendor_id column holds a TMS vendor UUID rather than a QBO id
--          (996907d6-…, "USMCA Audit Vendor 20260722", $1.00). Guarded by a strict uuid-shape regex
--          AND an entity-scoped existence check, so it resolves only a value that really is an
--          mdata.vendors id in the SAME company. Not a special case for one row: it is the correct
--          rule for that whole class, and the regex means a non-uuid string can never reach ::uuid.
--
-- DELIBERATELY LEFT NULL — 2 bills, NAMED, NOT FORCED:
--   9a548b5d-b1da-4182-8d79-15fd7635b83f  QBO vendor 2244  $1,065.38  partial  2026-07-29
--   bb42addb-65bc-49ca-b20a-7b65f872086a  QBO vendor 2244  $698.84    paid     2026-07-29
-- QBO vendor 2244 exists in NEITHER mdata.vendors NOR mdata.qbo_vendors. These are real money with a
-- vendor the mirror never received — a direct consequence of qbo_sync.step.vendors_pull having NEVER
-- succeeded (ACCT-F63). Inventing a vendor link for a paid bill would be fabricating an accounting
-- relationship; they stay NULL until the vendor mirror is repaired.
--
-- SAFETY: idempotent (only writes WHERE mdata_vendor_id IS NULL), additive, no DELETE, entity-scoped
-- on both sides of every join. No GL, no balances, no posting.

DO $$
BEGIN
  IF to_regclass('accounting.bills') IS NULL OR to_regclass('mdata.vendors') IS NULL THEN
    RAISE NOTICE 'bills/vendors absent — skipping ACCT-F73 backfill';
    RETURN;
  END IF;

  -- PASS 1: QBO vendor id -> canonical uuid, same operating company.
  UPDATE accounting.bills b
     SET mdata_vendor_id = v.id,
         updated_at = now()
    FROM mdata.vendors v
   WHERE v.qbo_vendor_id = b.vendor_id
     AND v.operating_company_id = b.operating_company_id
     AND b.mdata_vendor_id IS NULL;

  -- PASS 2: vendor_id already holds a TMS vendor UUID (uuid-shaped AND a real row in this company).
  UPDATE accounting.bills b
     SET mdata_vendor_id = v.id,
         updated_at = now()
    FROM mdata.vendors v
   WHERE b.mdata_vendor_id IS NULL
     -- CASE, not a bare ::uuid guarded by a preceding regex: SQL does NOT guarantee predicate
     -- evaluation order, and a JOIN form of this cast aborted with
     -- 'invalid input syntax for type uuid: "2244"' when I simulated it read-only on prod. CASE
     -- forces the shape test to run first, so a non-uuid vendor_id can never reach the cast.
     AND v.id = (CASE
                   WHEN b.vendor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     THEN b.vendor_id::uuid
                 END)
     AND v.operating_company_id = b.operating_company_id;
END $$;
