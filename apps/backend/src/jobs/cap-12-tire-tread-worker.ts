/**
 * CAP-12 Tire Tread Projection Worker — GAP-62
 * Daily cron: compute replacement projections for all active units.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { TRACTOR_POSITIONS } from "../maintenance/tires.routes.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { getLatestForUnit } from "../integrations/samsara/cap-12-tire-tread/measurement.service.js";
import {
  projectReplacementFromMeasurements,
  upsertProjection,
} from "../integrations/samsara/cap-12-tire-tread/projection.service.js";

let initialized = false;

const CRON_EXPRESSION = "0 5 * * *";
const CRON_TZ = "America/Chicago";
const CRON_NAME = "maintenance.cap12_tire_tread.projections";

export async function listActiveUnitIds(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  operatingCompanyId: string
): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.units
      WHERE operating_company_id = $1
        AND status = 'InService'
        AND deactivated_at IS NULL
      ORDER BY unit_number
    `,
    [operatingCompanyId]
  );
  return res.rows.map((row) => row.id);
}

export async function runCap12TireTreadWorkerTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
}): Promise<{ companiesProcessed: number; projectionsUpserted: number }> {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  let companiesProcessed = 0;
  let projectionsUpserted = 0;

  await withLuciaBypassImpl(async (client) => {
    const companies = await client.query<{ operating_company_id: string }>(
      `
        SELECT id::text AS operating_company_id
        FROM org.companies
        WHERE is_active = true
          AND deactivated_at IS NULL
      `
    );

    for (const row of companies.rows) {
      const operatingCompanyId = String(row.operating_company_id ?? "");
      if (!operatingCompanyId) continue;
      assertTenantContext(operatingCompanyId, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

      const unitIds = await listActiveUnitIds(client, operatingCompanyId);
      for (const unitUuid of unitIds) {
        const latest = await getLatestForUnit(client, operatingCompanyId, unitUuid);
        if (latest.length === 0) continue;

        const positions = new Set([
          ...latest.map((m) => m.tire_position),
          ...TRACTOR_POSITIONS.map((p) => p.code),
        ]);

        for (const position of positions) {
          const res = await client.query(
            `
              SELECT
                uuid::text,
                operating_company_id::text,
                unit_uuid::text,
                tire_position,
                tread_depth_32nds,
                measured_at::text,
                measured_by_user_uuid::text,
                source,
                odometer_miles,
                created_at::text
              FROM maintenance.tire_tread_measurements
              WHERE operating_company_id = $1
                AND unit_uuid = $2
                AND tire_position = $3
              ORDER BY measured_at ASC
            `,
            [operatingCompanyId, unitUuid, position]
          );
          if (res.rows.length === 0) continue;

          const projection = projectReplacementFromMeasurements(res.rows, position);
          await upsertProjection(client, operatingCompanyId, projection);
          projectionsUpserted += 1;
        }
      }
      companiesProcessed += 1;
    }
  });

  return { companiesProcessed, projectionsUpserted };
}

export function initializeCap12TireTreadWorker(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_CAP12_TIRE_TREAD_WORKER === "false") {
    app.log.info("CAP-12 tire tread worker disabled via ENABLE_CAP12_TIRE_TREAD_WORKER=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await runCap12TireTreadWorkerTick();
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info({ cron: CRON_EXPRESSION, tz: CRON_TZ }, "[STARTUP] cap-12-tire-tread-worker scheduled");
}
