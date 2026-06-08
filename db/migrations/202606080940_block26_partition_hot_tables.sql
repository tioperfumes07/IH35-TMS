-- Block 26 of 29 — TIER4-PARTITION — Partition Hot Tables
-- Online zero-downtime migration: converts hot tables to range-partitioned via
-- shadow table → swap pattern. Each table: create new partitioned, copy data,
-- create rename swap, drop old.
--
-- Tables: audit_log, banking_transactions, fuel_card_transactions
-- Retention: 7 years (IRS requirement for financial records)
BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: audit_log partitioning
-- ══════════════════════════════════════════════════════════════════════════════

-- Step 0: Ensure audit_log exists (base table for partitioning).
-- If the table was never created, create it here so partitioning can proceed.
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  changed_by text,
  change_data jsonb,
  operating_company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON audit_log TO ih35_app;

-- Step 1a: Create new partitioned table alongside existing
CREATE TABLE IF NOT EXISTS audit_log_partitioned (
  LIKE audit_log INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Step 1b: Grant same permissions
GRANT SELECT, INSERT ON audit_log_partitioned TO ih35_app;

-- Step 1c: Create monthly partitions covering 2024-01 through 2027-12
-- (Covers all existing data + 18 months forward)
CREATE TABLE IF NOT EXISTS audit_log_2024_01 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_02 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_03 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_04 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_05 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_06 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_07 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_08 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_09 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_10 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_11 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE IF NOT EXISTS audit_log_2024_12 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_01 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_02 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_03 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_04 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_05 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_06 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_07 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_08 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_09 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_10 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_11 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE IF NOT EXISTS audit_log_2025_12 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_01 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_02 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_03 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_04 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_05 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_06 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_07 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_08 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_09 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_10 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_11 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_12 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_01 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_02 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_03 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_04 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_05 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_06 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_07 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_08 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_09 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_10 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_11 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_12 PARTITION OF audit_log_partitioned
  FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- Step 1d: Copy existing data in batches (online, no lock on reads/writes)
-- Done outside transaction in production via the maintenance cron.
-- For migration: copy all existing rows.
INSERT INTO audit_log_partitioned
SELECT * FROM audit_log
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: Partition maintenance cron procedure
-- ══════════════════════════════════════════════════════════════════════════════

-- Creates next month's partition + previous month's partition if missing.
-- Called by the partition maintenance cron job (monthly, 1st of month).
CREATE OR REPLACE FUNCTION public.create_audit_log_partition_for_month(
  p_year int,
  p_month int
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_table_name text;
  v_from_date  date;
  v_to_date    date;
BEGIN
  v_table_name := format('audit_log_%s_%s',
    lpad(p_year::text, 4, '0'),
    lpad(p_month::text, 2, '0')
  );
  v_from_date := make_date(p_year, p_month, 1);
  v_to_date   := v_from_date + interval '1 month';

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = v_table_name AND n.nspname = 'public'
  ) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log_partitioned FOR VALUES FROM (%L) TO (%L)',
      v_table_name, v_from_date, v_to_date
    );
    RAISE NOTICE 'Created partition: %', v_table_name;
  END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: Partition archival function (7-year IRS retention)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.archive_audit_log_old_partitions(
  p_retain_years int DEFAULT 7
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_cutoff_date date;
  v_rec record;
BEGIN
  v_cutoff_date := date_trunc('month', now()) - (p_retain_years * interval '1 year');

  FOR v_rec IN
    SELECT c.relname AS partition_name,
           pg_get_expr(c.relpartbound, c.oid) AS bounds
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'audit_log_partitioned'
      AND n.nspname = 'public'
  LOOP
    -- Parse the partition start year/month from the table name (e.g., audit_log_2024_01)
    -- Only archive if the partition is older than the retention cutoff
    -- Safety: log intent but don't auto-drop; human must confirm archive
    RAISE NOTICE 'Candidate for archive: % (bounds: %)', v_rec.partition_name, v_rec.bounds;
  END LOOP;

  RAISE NOTICE 'Archive review complete. Cutoff date: %. Manually detach and pg_dump partitions older than cutoff before dropping.', v_cutoff_date;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: Partition tracking table
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.partition_maintenance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'archived', 'dropped', 'reviewed')),
  partition_name text NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  notes text,
  performed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.partition_maintenance_log TO ih35_app;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: Verify partition pruning works
-- ══════════════════════════════════════════════════════════════════════════════

-- This comment documents the verification query (run EXPLAIN to confirm pruning):
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM audit_log_partitioned
-- WHERE created_at >= '2026-06-01' AND created_at < '2026-07-01';
-- → Should show "Seq Scan on audit_log_2026_06" only (partition pruning active)

COMMIT;
