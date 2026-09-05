#!/usr/bin/env tsx
/**
 * scripts/run-samsara-driver-mirror-collector.ts — ROW-39 on-demand trigger. Calls the SAME
 * collectSamsaraDriverMirror() function the 5 */12 * * * cron calls, real service code, no direct
 * SQL for the collector's own writes.
 *
 * Usage: DATABASE_URL=<neon prod> npx tsx scripts/run-samsara-driver-mirror-collector.ts <operating_company_id>
 */
import { collectSamsaraDriverMirror } from "../apps/backend/src/integrations/samsara/driver-mirror-collector.js";

async function main() {
  const operatingCompanyId = process.argv[2];
  if (!operatingCompanyId) throw new Error("usage: run-samsara-driver-mirror-collector.ts <operating_company_id>");
  const result = await collectSamsaraDriverMirror(operatingCompanyId);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
