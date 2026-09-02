/**
 * GO-20 slice B — Predictive Maintenance Alerts worker (docs/lockdown/GO-20-EIGHT-FEATURES.txt).
 * Nightly: reads maintenance.brake_projections + maintenance.tire_projections (already computed
 * by cap-13-brake-wear-worker.ts / the tire equivalent), opens an alert in maintenance.predictive_
 * alerts where projected_replacement_date is within the horizon (warning 14 days, critical 7),
 * and auto-closes an alert when a newer projection clears it or its linked work order completes.
 *
 * source_projection_id is NOT a real FK (points at brake_projections.uuid or tire_projections.uuid
 * depending on alert_type — see the migration's header comment) — this worker is where that
 * invariant is enforced, by construction (it only ever writes a source_projection_id it just read
 * from the matching table in the same tick).
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;

const CRON_EXPRESSION = "0 5 * * *";
const CRON_TZ = "America/Chicago";
const CRON_NAME = "maintenance.predictive_alerts_worker";

export const WARNING_HORIZON_DAYS = 14;
export const CRITICAL_HORIZON_DAYS = 7;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

async function relationExists(client: DbClient, relation: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

type ProjectionRow = {
  source_uuid: string;
  unit_uuid: string;
  position_code: string;
  current_measure: number;
  threshold_measure: number;
  projected_replacement_date: string | null;
};

async function upsertAlertsForType(
  client: DbClient,
  operatingCompanyId: string,
  alertType: "brake_wear" | "tire_tread",
  measureUnit: "mm" | "32nds",
  rows: ProjectionRow[]
): Promise<{ opened: number; updated: number; cleared: number }> {
  let opened = 0;
  let updated = 0;
  let cleared = 0;

  for (const row of rows) {
    if (!row.projected_replacement_date) continue;
    const daysRemaining = Math.floor(
      (new Date(row.projected_replacement_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const existing = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM maintenance.predictive_alerts
        WHERE operating_company_id = $1::uuid
          AND unit_id = $2::uuid
          AND alert_type = $3
          AND position_code = $4
          AND resolved_at IS NULL
          AND voided_at IS NULL
      `,
      [operatingCompanyId, row.unit_uuid, alertType, row.position_code]
    );

    if (daysRemaining > WARNING_HORIZON_DAYS) {
      // Outside the horizon — a newer projection cleared it. Close any open alert for this
      // position (GUARD: "clearing the measurement and asserting the alert closes").
      if (existing.rows.length) {
        await client.query(
          `
            UPDATE maintenance.predictive_alerts
            SET resolved_at = now(), resolution_note = 'auto-cleared: newer projection outside horizon', updated_at = now()
            WHERE id = $1::uuid AND resolved_at IS NULL
          `,
          [existing.rows[0].id]
        );
        cleared += 1;
      }
      continue;
    }

    const severity = daysRemaining <= CRITICAL_HORIZON_DAYS ? "critical" : "warning";
    if (existing.rows.length) {
      await client.query(
        `
          UPDATE maintenance.predictive_alerts
          SET source_projection_id = $2::uuid,
              current_measure = $3,
              threshold_measure = $4,
              projected_failure_date = $5::date,
              days_remaining = $6,
              severity = $7,
              updated_at = now()
          WHERE id = $1::uuid AND resolved_at IS NULL
        `,
        [
          existing.rows[0].id,
          row.source_uuid,
          row.current_measure,
          row.threshold_measure,
          row.projected_replacement_date,
          daysRemaining,
          severity,
        ]
      );
      updated += 1;
    } else {
      await client.query(
        `
          INSERT INTO maintenance.predictive_alerts (
            operating_company_id, unit_id, alert_type, position_code, source_projection_id,
            current_measure, threshold_measure, measure_unit, projected_failure_date,
            days_remaining, severity
          ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, $9::date, $10, $11)
          ON CONFLICT (operating_company_id, unit_id, alert_type, position_code)
            WHERE resolved_at IS NULL AND voided_at IS NULL
            DO UPDATE SET
              source_projection_id = EXCLUDED.source_projection_id,
              current_measure = EXCLUDED.current_measure,
              threshold_measure = EXCLUDED.threshold_measure,
              projected_failure_date = EXCLUDED.projected_failure_date,
              days_remaining = EXCLUDED.days_remaining,
              severity = EXCLUDED.severity,
              updated_at = now()
        `,
        [
          operatingCompanyId,
          row.unit_uuid,
          alertType,
          row.position_code,
          row.source_uuid,
          row.current_measure,
          row.threshold_measure,
          measureUnit,
          row.projected_replacement_date,
          daysRemaining,
          severity,
        ]
      );
      opened += 1;
    }
  }

  return { opened, updated, cleared };
}

/** Closes any open alert whose linked work order has completed (spec: "closes ... when a work
 * order closes against that position"). Runs after the upsert pass so a freshly-linked alert is
 * eligible the same tick its work order completes. */
async function closeAlertsForCompletedWorkOrders(client: DbClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ id: string }>(
    `
      UPDATE maintenance.predictive_alerts a
      SET resolved_at = now(), resolution_note = 'auto-closed: linked work order completed', updated_at = now()
      FROM maintenance.work_orders wo
      WHERE a.work_order_id = wo.id
        AND a.operating_company_id = $1::uuid
        AND wo.operating_company_id = $1::uuid
        AND a.resolved_at IS NULL
        AND a.voided_at IS NULL
        AND wo.status IN ('complete', 'completed')
      RETURNING a.id::text AS id
    `,
    [operatingCompanyId]
  );
  return res.rows.length;
}

export async function runPredictiveAlertsWorkerTick(
  deps?: { withLuciaBypassImpl?: typeof withLuciaBypass }
): Promise<{ companiesProcessed: number; opened: number; updated: number; cleared: number; autoClosed: number }> {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  let companiesProcessed = 0;
  let opened = 0;
  let updated = 0;
  let cleared = 0;
  let autoClosed = 0;

  await withLuciaBypassImpl(async (client) => {
    if (!(await relationExists(client, "maintenance.predictive_alerts"))) return;
    const brakeExists = await relationExists(client, "maintenance.brake_projections");
    const tireExists = await relationExists(client, "maintenance.tire_projections");
    if (!brakeExists && !tireExists) return;

    const companies = await client.query<{ id: string }>(
      `SELECT id::text FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`
    );

    for (const company of companies.rows) {
      const operatingCompanyId = String(company.id ?? "");
      if (!operatingCompanyId) continue;
      assertTenantContext(operatingCompanyId, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

      if (brakeExists) {
        const brakeRows = await client.query<ProjectionRow>(
          `
            SELECT uuid::text AS source_uuid, unit_uuid::text AS unit_uuid, brake_position AS position_code,
                   current_thickness_mm AS current_measure, threshold_mm AS threshold_measure,
                   projected_replacement_date::text AS projected_replacement_date
            FROM maintenance.brake_projections
            WHERE operating_company_id = $1::uuid
          `,
          [operatingCompanyId]
        );
        const r = await upsertAlertsForType(client, operatingCompanyId, "brake_wear", "mm", brakeRows.rows);
        opened += r.opened;
        updated += r.updated;
        cleared += r.cleared;
      }

      if (tireExists) {
        const tireRows = await client.query<ProjectionRow>(
          `
            SELECT uuid::text AS source_uuid, unit_uuid::text AS unit_uuid, tire_position AS position_code,
                   current_depth_32nds AS current_measure, threshold_32nds AS threshold_measure,
                   projected_replacement_date::text AS projected_replacement_date
            FROM maintenance.tire_projections
            WHERE operating_company_id = $1::uuid
          `,
          [operatingCompanyId]
        );
        const r = await upsertAlertsForType(client, operatingCompanyId, "tire_tread", "32nds", tireRows.rows);
        opened += r.opened;
        updated += r.updated;
        cleared += r.cleared;
      }

      autoClosed += await closeAlertsForCompletedWorkOrders(client, operatingCompanyId);
      companiesProcessed += 1;
    }
  });

  return { companiesProcessed, opened, updated, cleared, autoClosed };
}

export function initializePredictiveAlertsWorker(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_PREDICTIVE_ALERTS_WORKER === "false") {
    app.log.info("Predictive alerts worker disabled via ENABLE_PREDICTIVE_ALERTS_WORKER=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await runPredictiveAlertsWorkerTick();
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */,
      timezone: CRON_TZ,
    }
  );

  app.log.info({ cron: CRON_EXPRESSION, tz: CRON_TZ }, "[STARTUP] predictive-alerts-worker scheduled");
}
