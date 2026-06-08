import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../../auth/db.js";
import { importSamsaraVehicles } from "./vehicle-import.service.js";
import { importSamsaraDrivers } from "./driver-import.service.js";
import { runDailyReconciliation } from "../qbo/reconciliation-report.service.js";

const WORKER = "integrations.ds_daily_sync";
let timer: NodeJS.Timeout | undefined;

function msUntil4amCT() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(10, 0, 0, 0); // ~4am CT
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export function initializeDataSovereigntyDailySync(app: FastifyInstance) {
  if (process.env.NODE_ENV === "test") return () => undefined;
  const run = async () => {
    await withLuciaBypass(async (client) => {
      const companies = await client.query<{ id: string }>(`SELECT id::text AS id FROM org.companies WHERE is_active = true LIMIT 50`);
      for (const { id } of companies.rows) {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [id]);
        await importSamsaraVehicles(client, id);
        await importSamsaraDrivers(client, id);
        await runDailyReconciliation(client, id);
      }
    });
    app.log.info(`[${WORKER}] daily sync complete`);
    timer = setTimeout(run, msUntil4amCT());
  };
  timer = setTimeout(run, 120_000);
  return () => { if (timer) clearTimeout(timer); };
}
