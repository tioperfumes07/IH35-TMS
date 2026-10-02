/**
 * ENGINE: Samsara fault-code poll
 * SCHEDULE: 0 3 * * *
 * WRITES: maintenance.samsara_fault_code_history, maintenance.work_orders (auto draft), notifications
 * IDEMPOTENCY: UNIQUE(raw_event_id, fault_code) ON CONFLICT on history; auto work order claimed by SAME-STATEMENT WHERE auto_wo_id IS NULL AND auto_wo_created_at IS NULL
 * OVERLAP: second run records no history and opens no second work order
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 297.1 J-3 — Samsara fault code poller.
 *
 * FINDING (measured live before writing this): the only fault path in this repo is
 * processVehicleFaultCodeWebhookEvent, reached from webhook-projectors/vehicle-projector.ts, and
 * integrations.samsara_webhook_events has ZERO rows, ever -- this account has never delivered a
 * webhook. This cron does NOT chase the webhook; it polls the same /fleet/vehicles/stats endpoint
 * the position cron already uses, requesting faultCodes on its own call (SAMSARA_STATS_TYPES_FAULT
 * in samsara-client.ts), and hands each vehicle's raw row to the EXISTING processor
 * (processVehicleFaultCodeWebhookEvent) wrapped in a synthetic SamsaraWebhookEvent -- reusing it
 * exactly as it already runs for a real webhook, never a second processor.
 *
 * ERROR POLICY: same as relay-fuel-ingest.cron.ts -- one company's failure is isolated (logged,
 * recorded, does not abort the other companies in the same tick), but if ANY company failed, the
 * whole tick's error is re-thrown (aggregated) at the end so the failure is never silently
 * swallowed. Deliberately does NOT use wrapBackgroundJobTick, which only logs and does not rethrow.
 */
import { resolveSamsaraApiToken } from "./samsara-token.js";
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { createHash } from "node:crypto";
import { withLuciaBypass } from "../../auth/db.js";
import { assertTenantContext } from "../../cron/_helpers/tenant-context-guard.js";
import { processVehicleFaultCodeWebhookEvent } from "./fault-code-processor.service.js";
import type { SamsaraWebhookEvent } from "./webhook-projection.types.js";
import { SamsaraApiError, SamsaraClient } from "./samsara-client.js";
import type { PgClient } from "./samsara.service.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";
import { loadUnitIdBySamsaraVehicleId } from "./samsara-positions.service.js";

const SAMSARA_FAULT_POLL_AUDIT_SOURCE = "SAMSARA-FAULT-POLL-CRON-1";

async function listActiveCompanyIds(client: PgClient): Promise<string[]> {
  const res = await client.query(
    `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
  );
  return res.rows.map((r) => String(r.id));
}

/** Deterministic per (company, vehicle, day) -- repeated ticks the same day dedupe against the
 *  same fault via processVehicleFaultCodeWebhookEvent's own raw_event_id+fault_code lookup, the
 *  same mechanism a real repeated webhook delivery would dedupe against. */
function stableFaultEventId(operatingCompanyId: string, samsaraVehicleId: string, dayIso: string): string {
  const hash = createHash("sha1").update(`fault-poll:${operatingCompanyId}:${samsaraVehicleId}:${dayIso}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export type FaultPollTenantResult = {
  vehicles_with_faults: number;
  histories_inserted: number;
  draft_wos_created: number;
};

async function pollFaultsForCompany(
  client: PgClient,
  operatingCompanyId: string
): Promise<FaultPollTenantResult> {
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!cfg || !Boolean(cfg.is_enabled)) {
    return { vehicles_with_faults: 0, histories_inserted: 0, draft_wos_created: 0 };
  }

  const token = resolveSamsaraApiToken(cfg as Record<string, unknown>);
  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });

  const rows = await api.listVehicleFaultCodes();
  const unitByVehicleId = await loadUnitIdBySamsaraVehicleId(client, operatingCompanyId);
  const dayIso = new Date().toISOString().slice(0, 10);

  let vehiclesWithFaults = 0;
  let historiesInserted = 0;
  let draftWosCreated = 0;

  for (const row of rows) {
    const unitId = unitByVehicleId.get(row.id);
    if (!unitId) continue;

    const event: SamsaraWebhookEvent = {
      id: stableFaultEventId(operatingCompanyId, row.id, dayIso),
      operating_company_id: operatingCompanyId,
      event_type: "vehicle.fault_code.polled",
      samsara_event_id: null,
      signature_valid: true,
      payload: row.raw,
      received_at: new Date().toISOString(),
      projection_attempts: 0,
    };

    const result = await processVehicleFaultCodeWebhookEvent(client as never, event, unitId);
    if (result.faults_processed > 0) vehiclesWithFaults += 1;
    historiesInserted += result.histories_inserted;
    draftWosCreated += result.draft_wos_created;
  }

  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    "integrations.samsara_fault_poll",
    "info",
    JSON.stringify({
      operating_company_id: operatingCompanyId,
      vehicles_polled: rows.length,
      vehicles_with_faults: vehiclesWithFaults,
      histories_inserted: historiesInserted,
      draft_wos_created: draftWosCreated,
    }),
    SAMSARA_FAULT_POLL_AUDIT_SOURCE,
  ]);

  return { vehicles_with_faults: vehiclesWithFaults, histories_inserted: historiesInserted, draft_wos_created: draftWosCreated };
}

export async function runSamsaraFaultPollCronTick(): Promise<void> {
  const failures: { operating_company_id: string; error: unknown }[] = [];

  const companyIds = await withLuciaBypass(async (client) => listActiveCompanyIds(client as PgClient));

  for (const operatingCompanyId of companyIds) {
    try {
      assertTenantContext(operatingCompanyId, "integrations.samsara_fault_poll_cron");
      await withLuciaBypass(async (client) => {
        // membership-scope-exempt: internally-iterated-active-company
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        await pollFaultsForCompany(client as PgClient, operatingCompanyId);
      });
    } catch (error) {
      const message =
        error instanceof SamsaraApiError
          ? `${error.message}${error.statusCode ? `:http_${error.statusCode}` : ""}`
          : String((error as Error)?.message ?? error);
      failures.push({ operating_company_id: operatingCompanyId, error });
      await withLuciaBypass(async (client) => {
        await client
          .query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
            "integrations.samsara_fault_poll_failed",
            "warning",
            JSON.stringify({ operating_company_id: operatingCompanyId, error: message }),
            SAMSARA_FAULT_POLL_AUDIT_SOURCE,
          ])
          .catch(() => {});
      });
    }
  }

  if (failures.length > 0) {
    // Never silently swallow -- same policy as relay-fuel-ingest.cron.ts: surface the aggregated
    // failure so it reaches process-level logging/Sentry like any other uncaught background-job
    // error. Deliberately not wrapBackgroundJobTick, which only logs.
    throw new Error(
      `samsara_fault_poll_cron: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
        failures.map((f) => `${f.operating_company_id}(${String((f.error as Error)?.message ?? f.error)})`).join("; ")
    );
  }
}

let initialized = false;

export function initializeSamsaraFaultPollCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.SAMSARA_FAULT_POLL_CRON_ENABLED === "false") {
    app.log.info("Samsara fault poll cron disabled via SAMSARA_FAULT_POLL_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        await runSamsaraFaultPollCronTick();
      } catch (error) {
        app.log.error({ err: error }, "[SAMSARA_FAULT_POLL_CRON] tick failed");
        throw error;
      }
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Samsara fault poll cron scheduled (daily 03:00 America/Chicago)");
}
