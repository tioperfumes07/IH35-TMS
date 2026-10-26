-- LEAD 10-25-2026 — sms.queue / whatsapp.queue prod drift (verify-sql-write-targets, live schema).
-- 0166_block_h_notification_queues used CREATE TABLE IF NOT EXISTS; on prod both tables already existed in an
-- older shape, so 0166's columns, RLS and company policy were never applied there. notifications/dispatcher.ts
-- inserts operating_company_id on both queues and to_phone on sms.queue (443.91) — on prod every such insert
-- fails (42703). Both prod queues hold 0 rows (read 2026-10-25), so NOT NULL is safe. Idempotent: on a fresh
-- build (0166 shape) every statement is a no-op.
DO $$
BEGIN
  IF to_regclass('sms.queue') IS NOT NULL THEN
    ALTER TABLE sms.queue ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);
    ALTER TABLE sms.queue ADD COLUMN IF NOT EXISTS to_phone text;
    IF NOT EXISTS (SELECT 1 FROM sms.queue WHERE operating_company_id IS NULL) THEN
      ALTER TABLE sms.queue ALTER COLUMN operating_company_id SET NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM sms.queue WHERE to_phone IS NULL) THEN
      ALTER TABLE sms.queue ALTER COLUMN to_phone SET NOT NULL;
    END IF;
    CREATE INDEX IF NOT EXISTS ix_sms_queue_company_created_at ON sms.queue (operating_company_id, created_at DESC);
    ALTER TABLE sms.queue ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS sms_queue_company_scope ON sms.queue;
    CREATE POLICY sms_queue_company_scope ON sms.queue FOR ALL TO ih35_app
      USING (operating_company_id::text = current_setting('app.operating_company_id', true)
             OR current_setting('app.bypass_rls', true) = 'lucia')
      WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true)
             OR current_setting('app.bypass_rls', true) = 'lucia');
  END IF;

  IF to_regclass('whatsapp.queue') IS NOT NULL THEN
    ALTER TABLE whatsapp.queue ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);
    IF NOT EXISTS (SELECT 1 FROM whatsapp.queue WHERE operating_company_id IS NULL) THEN
      ALTER TABLE whatsapp.queue ALTER COLUMN operating_company_id SET NOT NULL;
    END IF;
    CREATE INDEX IF NOT EXISTS ix_whatsapp_queue_company_created_at ON whatsapp.queue (operating_company_id, created_at DESC);
    ALTER TABLE whatsapp.queue ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS whatsapp_queue_company_scope ON whatsapp.queue;
    CREATE POLICY whatsapp_queue_company_scope ON whatsapp.queue FOR ALL TO ih35_app
      USING (operating_company_id::text = current_setting('app.operating_company_id', true)
             OR current_setting('app.bypass_rls', true) = 'lucia')
      WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true)
             OR current_setting('app.bypass_rls', true) = 'lucia');
  END IF;
END $$;
