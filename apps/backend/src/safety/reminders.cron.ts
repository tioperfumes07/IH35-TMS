import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;

// OWNER LAW: USMCA only. TRANSPORTATION (91e0bf0a) and TRUCKING (b49a737b) are FROZEN.
// This cron runs under withLuciaBypass (RLS OFF). Without an operating_company_id predicate
// the resolve-stale statement would touch every open reminder in every company on every tick
// (engine-audit E-SCOPE / frozen-entity violation, ROUND 301 Cursor independent audit).
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

const REFRESH_SQL = `
  WITH candidates AS (
    SELECT
      q.operating_company_id,
      q.driver_id,
      'driver_qualification'::text AS source_type,
      q.id AS source_id,
      q.item_name,
      COALESCE(q.expiry_date, CURRENT_DATE) AS due_date,
      CASE
        WHEN q.status = 'missing' THEN -1
        WHEN q.expiry_date IS NULL THEN 9999
        ELSE (q.expiry_date - CURRENT_DATE)
      END::int AS days_to_expiry
    FROM safety.driver_qualification_files q
    WHERE q.voided_at IS NULL
      AND q.operating_company_id = $1::uuid
      AND (q.status IN ('missing', 'expired') OR q.expiry_date IS NOT NULL)

    UNION ALL

    SELECT
      m.operating_company_id,
      m.driver_id,
      'medical_card'::text AS source_type,
      m.id AS source_id,
      m.card_number AS item_name,
      m.expiry_date AS due_date,
      (m.expiry_date - CURRENT_DATE)::int AS days_to_expiry
    FROM safety.medical_cards m
    WHERE m.voided_at IS NULL
      AND m.operating_company_id = $1::uuid

    UNION ALL

    SELECT
      b.operating_company_id,
      b.driver_id,
      'background_check'::text AS source_type,
      b.id AS source_id,
      b.check_type AS item_name,
      b.expiry_date AS due_date,
      (b.expiry_date - CURRENT_DATE)::int AS days_to_expiry
    FROM safety.background_checks b
    WHERE b.voided_at IS NULL
      AND b.operating_company_id = $1::uuid
      AND b.expiry_date IS NOT NULL

    UNION ALL

    SELECT
      t.operating_company_id,
      t.driver_id,
      'training_record'::text AS source_type,
      t.id AS source_id,
      t.training_name AS item_name,
      t.expiry_date AS due_date,
      (t.expiry_date - CURRENT_DATE)::int AS days_to_expiry
    FROM safety.training_records t
    WHERE t.voided_at IS NULL
      AND t.operating_company_id = $1::uuid
      AND t.expiry_date IS NOT NULL
  ),
  filtered AS (
    SELECT *
    FROM candidates
    WHERE days_to_expiry <= 30
  )
  INSERT INTO safety.compliance_reminders (
    operating_company_id,
    driver_id,
    source_type,
    source_id,
    item_name,
    due_date,
    days_to_expiry,
    severity,
    status,
    last_detected_at
  )
  SELECT
    f.operating_company_id,
    f.driver_id,
    f.source_type,
    f.source_id,
    f.item_name,
    f.due_date,
    f.days_to_expiry,
    CASE
      WHEN f.days_to_expiry < 0 THEN 'expired'
      WHEN f.days_to_expiry <= 7 THEN 'critical'
      ELSE 'warning'
    END AS severity,
    'open'::text AS status,
    now() AS last_detected_at
  FROM filtered f
  ON CONFLICT (operating_company_id, source_type, source_id, due_date)
  DO UPDATE
    SET item_name = EXCLUDED.item_name,
        days_to_expiry = EXCLUDED.days_to_expiry,
        severity = EXCLUDED.severity,
        status = CASE
          WHEN safety.compliance_reminders.status = 'dismissed' THEN 'dismissed'
          ELSE 'open'
        END,
        last_detected_at = now(),
        updated_at = now()
`;

export async function refreshSafetyReminders() {
  const refreshStartedAt = new Date().toISOString();
  await withLuciaBypass(async (client) => {
    assertTenantContext(USMCA_COMPANY_ID, "safety.reminders_cron");
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      USMCA_COMPANY_ID,
    ]);

    await client.query(REFRESH_SQL, [USMCA_COMPANY_ID]);
    // Resolve only USMCA open reminders that this tick did not refresh.
    // Never touch TRANSPORTATION / TRUCKING (frozen) — they are out of the $1 predicate.
    await client.query(
      `
        UPDATE safety.compliance_reminders
        SET status = 'resolved',
            updated_at = now()
        WHERE operating_company_id = $2::uuid
          AND status = 'open'
          AND last_detected_at < $1::timestamptz
      `,
      [refreshStartedAt, USMCA_COMPANY_ID]
    );
  });
}

export function initializeSafetyRemindersCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_SAFETY_REMINDERS_CRON === "false") {
    app.log.info("Safety reminders cron disabled via ENABLE_SAFETY_REMINDERS_CRON=false");
    return;
  }

  cron.schedule(
    "15 6 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "safety.reminders_cron",
        async () => {
          await refreshSafetyReminders();
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Safety reminders cron scheduled (daily 06:15 America/Chicago)");
}
