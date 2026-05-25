CREATE TABLE IF NOT EXISTS qa.guard_target (
  id uuid PRIMARY KEY
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      CREATE TRIGGER tg_audit_guard_target
      AFTER INSERT OR UPDATE OR DELETE ON qa.guard_target
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;
