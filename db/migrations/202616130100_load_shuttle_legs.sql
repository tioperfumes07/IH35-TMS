-- LEAD 443.238 (owner ruling 10-22 11:23 AM CT): 13692 / 13693 / 13695 were picked up at the shipper by the LOCAL driver in a
-- yard-shuttle truck and dropped in our truck yard; the line truck took them from the yard. The load had nowhere to record that
-- leg, so the stop-evidence engine looked only at the line truck (never at the shipper) and the pickup stayed unstamped.
--
-- dispatch.load_shuttle_legs — the local shuttle leg of a load: which pickup stop, which local unit / driver (when known), where
-- it was dropped (the yard), when, and on what evidence (a GPS stop event of the shuttle unit, or the owner's ruling). The
-- stop-evidence engine reads it; the load / trip / driver history show it. The local driver is salaried weekly (Rafael rule) —
-- a shuttle leg never creates a pay line.
--
-- CREATE only, additive, idempotent. FORCE RLS (entity), SELECT/INSERT/UPDATE to ih35_app (never DELETE — void-not-delete),
-- row audit via audit.tg_audit_row.
SET LOCAL lock_timeout = '60s';

CREATE TABLE IF NOT EXISTS dispatch.load_shuttle_legs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  load_id                uuid NOT NULL REFERENCES mdata.loads(id),
  from_stop_id           uuid NOT NULL REFERENCES mdata.load_stops(id),
  unit_id                uuid NULL REFERENCES mdata.units(id),
  driver_id              uuid NULL REFERENCES mdata.drivers(id),
  candidate_unit_numbers text[] NULL,
  dropped_at_place       text NOT NULL DEFAULT 'yard',
  picked_up_at           timestamptz NULL,
  dropped_at             timestamptz NULL,
  evidence               text NOT NULL,
  stop_event_id          uuid NULL,
  precision              text NOT NULL,
  note                   text NULL,
  is_sample_data         boolean NOT NULL DEFAULT false,
  voided_at              timestamptz NULL,
  voided_by_user_id      uuid NULL REFERENCES identity.users(id),
  void_reason            text NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id     uuid NULL REFERENCES identity.users(id),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_load_shuttle_legs_evidence CHECK (evidence IN ('gps_stop_event', 'owner_ruling', 'driver_report')),
  CONSTRAINT chk_load_shuttle_legs_precision CHECK (precision IN ('tracked', 'date_only')),
  CONSTRAINT chk_load_shuttle_legs_tracked_has_event CHECK (precision <> 'tracked' OR stop_event_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_load_shuttle_legs_one_live_per_stop
  ON dispatch.load_shuttle_legs (load_id, from_stop_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_load_shuttle_legs_company_load
  ON dispatch.load_shuttle_legs (operating_company_id, load_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_load_shuttle_legs_driver
  ON dispatch.load_shuttle_legs (operating_company_id, driver_id) WHERE voided_at IS NULL AND driver_id IS NOT NULL;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE dispatch.load_shuttle_legs ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE dispatch.load_shuttle_legs FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'dispatch' AND tablename = 'load_shuttle_legs' AND policyname = 'load_shuttle_legs_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY load_shuttle_legs_tenant ON dispatch.load_shuttle_legs
        FOR ALL
        USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
        WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
    $policy$;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON dispatch.load_shuttle_legs TO ih35_app';
  EXECUTE 'REVOKE DELETE ON dispatch.load_shuttle_legs FROM ih35_app';
  EXECUTE 'REVOKE ALL ON dispatch.load_shuttle_legs FROM PUBLIC';

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'dispatch.load_shuttle_legs'::regclass AND t.tgname = 'tg_audit_row_load_shuttle_legs' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER tg_audit_row_load_shuttle_legs
      AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_shuttle_legs
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
  END IF;
END
$$;

COMMENT ON TABLE dispatch.load_shuttle_legs IS
  'LEAD 443.238: the local yard-shuttle leg of a load (pickup stop -> yard, local unit / driver, evidence). Read by the stop-evidence engine; never a pay line (local driver salaried weekly).';
