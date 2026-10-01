/**
 * ROUND 304 T-51 — Samsara DVIR poll, every 2 hours, 7-day lookback (a DVIR Samsara later marks
 * 'resolved' is re-read and its WF-050 major-defect flag cleared). Writes through
 * ingestSamsaraDvirs only. SAMSARA_DVIR_POLL_CRON_ENABLED=false disables it.
 *
 * ERROR POLICY: same as fault-poll.cron.ts — one company's failure is isolated and audited, and the
 * aggregated failure is re-thrown at the end of the tick, never swallowed.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { decryptSamsaraSecret } from "../lib/samsara-crypto.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import type { PgClient } from "../integrations/samsara/samsara.service.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { ingestSamsaraDvirs } from "./samsara-dvir-ingest.service.js";

const AUDIT_SOURCE = "SAMSARA-DVIR-POLL-CRON-1";
export const DVIR_POLL_LOOKBACK_DAYS = 7;

function readEncryptedToken(config: Record<string, unknown> | null): Buffer | null {
  if (!config) return null;
  const canonical = config.encrypted_api_token;
  if (Buffer.isBuffer(canonical) && canonical.length > 0) return canonical;
  const legacy = config.api_token_encrypted;
  if (Buffer.isBuffer(legacy) && legacy.length > 0) return legacy;
  return null;
}

async function pollForCompany(client: PgClient, operatingCompanyId: string, tickAt: Date): Promise<void> {
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!cfg || !Boolean(cfg.is_enabled)) return;
  const api = new SamsaraClient({
    apiToken: decryptSamsaraSecret(readEncryptedToken(cfg)),
    samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });
  const endIso = tickAt.toISOString();
  const startIso = new Date(tickAt.getTime() - DVIR_POLL_LOOKBACK_DAYS * 86_400_000).toISOString();
  const dvirs = await api.listDvirs(startIso, endIso);
  const result = await ingestSamsaraDvirs(client, operatingCompanyId, dvirs, { apply: true });
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    "safety.samsara_dvir_poll",
    "info",
    JSON.stringify({ ...result, window_start: startIso, window_end: endIso }),
    AUDIT_SOURCE,
  ]);
}

export async function runSamsaraDvirPollCronTick(tickAt = new Date()): Promise<void> {
  const failures: { operating_company_id: string; message: string }[] = [];
  const companyIds = await withLuciaBypass(async (client) => {
    const res = await client.query(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    return res.rows.map((r: { id: string }) => String(r.id));
  });

  for (const operatingCompanyId of companyIds) {
    try {
      assertTenantContext(operatingCompanyId, "safety.samsara_dvir_poll_cron");
      await withLuciaBypass(async (client) => {
        // membership-scope-exempt: internally-iterated-active-company
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        await pollForCompany(client as PgClient, operatingCompanyId, tickAt);
      });
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      failures.push({ operating_company_id: operatingCompanyId, message });
      await withLuciaBypass(async (client) => {
        await client
          .query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
            "safety.samsara_dvir_poll_failed",
            "warning",
            JSON.stringify({ operating_company_id: operatingCompanyId, error: message }),
            AUDIT_SOURCE,
          ])
          .catch(() => {});
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `samsara_dvir_poll_cron: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
        failures.map((f) => `${f.operating_company_id}(${f.message})`).join("; ")
    );
  }
}

let initialized = false;

export function initializeSamsaraDvirPollCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.SAMSARA_DVIR_POLL_CRON_ENABLED === "false") {
    app.log.info("Samsara DVIR poll cron disabled via SAMSARA_DVIR_POLL_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    "25 */2 * * *",
    async () => {
      try {
        await runSamsaraDvirPollCronTick();
      } catch (error) {
        app.log.error({ err: error }, "[SAMSARA_DVIR_POLL_CRON] tick failed");
        throw error;
      }
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Samsara DVIR poll cron scheduled (every 2 h at :25, 7-day lookback)");
}
