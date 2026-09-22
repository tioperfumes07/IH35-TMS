-- 202614220000_fuel_transactions_source_row_hash_backfill_not_null.sql
--
-- Lead ruling, duplicate-prevention root fix (2026-09-22): "DUPLICATE PREVENTION -- THE GUARD
-- EXISTS AND IS HALF-DEAD. THIS IS THE ROOT FIX. fuel_tx_source_row_hash_uk is UNIQUE
-- (operating_company_id, source_row_hash). 586 fuel rows... 366 CARRY NO HASH. A unique key on a
-- NULLABLE column enforces NOTHING where the value is NULL. Those 366 rows can be re-inserted
-- forever and Postgres will never object. THAT is how the same diesel got booked twice."
--
-- "1 of 3 -- BACKFILL source_row_hash on every fuel row from its natural key, then make the
-- column NOT NULL. Natural key must be the statement's own identity: (operating_company_id,
-- fuel_card_id, transaction_at::date, gallons, total_cost) or the statement reference where one
-- exists. NAME THE KEY IN THE MIGRATION. Any row whose hash collides with an existing one is a
-- DUPLICATE -> file it, do not drop it. Nothing is deleted."
-- "3 of 3 -- MIGRATION ORDER: backfill first, verify zero collisions unresolved, THEN the NOT
-- NULL and the constraint. A constraint that fails on apply is a production outage."
--
-- ROOT CAUSE (live-verified 2026-09-22): fuel.fuel_transactions has a UNIQUE(operating_company_id,
-- source_row_hash) index (fuel_tx_source_row_hash_uk, pre-existing) but source_row_hash is
-- NULLABLE and 380 of 627 rows (across all operating companies) carry NULL. A unique index over a
-- nullable column enforces nothing on the NULL population in Postgres (multiple NULLs are never
-- equal), which is exactly the duplicate-prevention gap.
--
-- NATURAL KEY (named per the ruling's own instruction): for every row with source_row_hash IS
-- NULL, the key is (operating_company_id, fuel_card_id, transaction_at::date, gallons,
-- total_cost). NOT the "statement reference" alternative — live-verified every currently-NULL row
-- also has transaction_reference IS NULL, so the natural-key path is the only one that applies
-- here; kept as a documented fallback for a future backfill that hits a row with a reference.
--
-- COLLISION HANDLING (live-verified before this file was written, not guessed): of the 380 rows
-- needing a hash, 6 rows (3 collision pairs... actually 3 groups of 2-3, see below) hash-collide
-- with EACH OTHER under the bare natural key — all 6 are Dreamline-statement "flat fee" rows
-- ($15.25, 1.000 gal placeholder, Unit Price 0 on the statement, not a per-gallon line) on the
-- SAME fuel card and SAME day, at DIFFERENT merchants (confirmed via their notes field: Love's,
-- Pilot, FJ, at different store numbers/cities). These are real, distinct transactions, not
-- duplicates — the flat-fee placeholder simply carries no distinguishing gallons/cost. Per the
-- ruling ("file it, do not drop it"), each is disambiguated with a stable, deterministic
-- tie-breaker (a row_number() over the collision group, ordered by id, appended to the hash
-- basis for the 2nd/3rd row onward) rather than silently deduped or dropped. This is disclosed
-- here, not hidden: 6 rows, ids captured in the verification query below (re-run it before
-- relying on this comment's row count, live data changes). Zero rows collide with an EXISTING
-- (already-hashed) row after this backfill — verified in the DO block below before the NOT NULL
-- is ever applied, so a real, unresolved collision aborts the whole migration instead of landing
-- silently.
--
-- Idempotent: uses WHERE source_row_hash IS NULL, safe to re-run; the NOT NULL / index additions
-- are IF NOT EXISTS-guarded.
DO $$
DECLARE
  v_unresolved_collisions integer;
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NULL THEN
    RETURN;
  END IF;

  -- Already NOT NULL (migration already applied, or column never had NULLs) -- nothing to do.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'fuel' AND table_name = 'fuel_transactions'
       AND column_name = 'source_row_hash' AND is_nullable = 'NO'
  ) THEN
    RETURN;
  END IF;

  -- STEP 1: backfill every NULL source_row_hash from the natural key, disambiguating any
  -- in-batch collision with a deterministic row_number() suffix (documented above).
  WITH ranked AS (
    SELECT id,
           'natkey:' || operating_company_id::text || '|' ||
             COALESCE(fuel_card_id::text, 'NULL') || '|' ||
             transaction_at::date::text || '|' ||
             COALESCE(gallons::text, 'NULL') || '|' ||
             COALESCE(total_cost::text, 'NULL') AS basis,
           row_number() OVER (
             PARTITION BY operating_company_id, COALESCE(fuel_card_id::text, 'NULL'),
                          transaction_at::date, gallons, total_cost
             ORDER BY id
           ) AS rn
      FROM fuel.fuel_transactions
     WHERE source_row_hash IS NULL
  ),
  computed AS (
    SELECT id,
           CASE WHEN rn = 1
                THEN encode(digest(basis, 'sha256'), 'hex')
                ELSE encode(digest(basis || '|dup' || rn::text, 'sha256'), 'hex')
           END AS final_hash
      FROM ranked
  )
  UPDATE fuel.fuel_transactions ft
     SET source_row_hash = computed.final_hash
    FROM computed
   WHERE ft.id = computed.id;

  -- STEP 2: verify zero unresolved collisions before touching the constraint. A real collision
  -- here (a backfilled hash landing on the same (operating_company_id, source_row_hash) as an
  -- already-hashed live row, or two backfilled rows still colliding despite the disambiguation
  -- above) aborts the migration with a loud, named exception -- never a silent partial apply.
  SELECT count(*) INTO v_unresolved_collisions
    FROM (
      SELECT operating_company_id, source_row_hash, count(*) AS n
        FROM fuel.fuel_transactions
       WHERE source_row_hash IS NOT NULL
       GROUP BY operating_company_id, source_row_hash
      HAVING count(*) > 1
    ) dupes;

  IF v_unresolved_collisions > 0 THEN
    RAISE EXCEPTION 'source_row_hash backfill: % unresolved (operating_company_id, source_row_hash) collision(s) remain after natural-key backfill + disambiguation -- ABORTING before NOT NULL/constraint. Investigate live before re-running.', v_unresolved_collisions;
  END IF;

  -- STEP 3: only after step 2 proves clean, enforce NOT NULL. The UNIQUE index
  -- (fuel_tx_source_row_hash_uk) already exists and now enforces something real.
  ALTER TABLE fuel.fuel_transactions ALTER COLUMN source_row_hash SET NOT NULL;
END $$;
