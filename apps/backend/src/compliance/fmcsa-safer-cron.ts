import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { listStaleSaferEntities, sleep, verifySaferEntity } from "./fmcsa-safer-verifier.js";

const RATE_LIMIT_MS = 1500;
let cronInitialized = false;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export async function runFmcsaSaferVerificationTick(options?: { operatingCompanyId?: string; maxEntities?: number }) {
  const maxEntities = options?.maxEntities ?? 120;
  let processed = 0;
  let verified = 0;
  const failures: string[] = [];

  await withLuciaBypass(async (client) => {
    const stale = await listStaleSaferEntities(client as DbClient, options?.operatingCompanyId, maxEntities);
    for (const entity of stale) {
      assertTenantContext(entity.operating_company_id, "compliance.fmcsa_safer_verification_cron");
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [entity.operating_company_id]);
      try {
        const result = await verifySaferEntity(client as DbClient, {
          entityType: entity.entity_type,
          entityId: entity.id,
          operatingCompanyId: entity.operating_company_id,
        });
        processed += 1;
        if (result.safer_status === "verified") verified += 1;
      } catch (error) {
        const reason = (error as Error).message ?? "unknown_error";
        failures.push(`${entity.entity_type}:${entity.id}:${reason}`);
      }
      if (processed < stale.length) {
        await sleep(RATE_LIMIT_MS);
      }
    }
  });

  if (failures.length > 0) {
    const preview = failures.slice(0, 5).join(", ");
    throw new Error(
      `fmcsa_safer_verification_partial_failure processed=${processed} verified=${verified} failures=${failures.length} details=${preview}`
    );
  }

  return { processed, verified, failure_count: failures.length };
}

export function initializeFmcsaSaferVerificationCron(app: FastifyInstance) {
  if (cronInitialized) return;
  cronInitialized = true;
  if (process.env.ENABLE_FMCSA_SAFER_VERIFICATION_CRON === "false") {
    app.log.info("FMCSA SAFER verification cron disabled via ENABLE_FMCSA_SAFER_VERIFICATION_CRON=false");
    return;
  }
  cron.schedule(
    "15 6 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "compliance.fmcsa_safer_verification_cron",
        async () => {
          await runFmcsaSaferVerificationTick();
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );
}
