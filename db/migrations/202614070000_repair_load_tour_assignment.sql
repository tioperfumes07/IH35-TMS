-- Meaning: repair the measured USMCA load/presettlement tour-orphans created by the former
-- standalone SB/TR fallback. Additive data repair; no rows are deleted or voided.
DO $repair$
DECLARE
  row_record record;
  resolved_tour_id uuid;
BEGIN
  FOR row_record IN
    SELECT id, presettlement_link_id
      FROM mdata.loads
     WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
       AND assigned_primary_driver_id IS NOT NULL
       AND tour_id IS NULL
       AND soft_deleted_at IS NULL
       AND status <> 'cancelled'
     ORDER BY id
     FOR UPDATE
  LOOP
    resolved_tour_id := gen_random_uuid();
    UPDATE mdata.loads
       SET tour_id = resolved_tour_id,
           updated_at = now()
     WHERE id = row_record.id
       AND tour_id IS NULL;

    UPDATE driver_finance.driver_settlements
       SET tour_id = resolved_tour_id,
           updated_at = now()
     WHERE id = row_record.presettlement_link_id
       AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
       AND tour_id IS NULL;
  END LOOP;
END
$repair$;
