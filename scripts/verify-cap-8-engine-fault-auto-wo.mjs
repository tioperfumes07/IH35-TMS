#!/usr/bin/env node
import { readFileSync } from "node:fs";

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");
const routesTs = readFileSync("apps/backend/src/integrations/samsara/engine-faults/routes.ts", "utf8");
const catalogTs = readFileSync("apps/backend/src/integrations/samsara/engine-faults/severe-fault-catalog.ts", "utf8");
const autoWoTs = readFileSync("apps/backend/src/maintenance/work-orders/auto-create-from-fault.ts", "utf8");
const migrationSql = readFileSync("db/migrations/202606080216_engine_fault_events.sql", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const ciYml = readFileSync(".github/workflows/ci.yml", "utf8");

const checks = [
  ["index registers engine fault routes", indexTs.includes("registerSamsaraEngineFaultRoutes")],
  ["webhook path mounted", routesTs.includes("/api/integrations/samsara/engine-faults/webhook")],
  ["signature verify wired", routesTs.includes("verifySamsaraWebhookSignature")],
  ["idempotent insert", routesTs.includes("handleEngineFaultEvent") || readFileSync("apps/backend/src/integrations/samsara/engine-faults/fault-handler.service.ts", "utf8").includes("ON CONFLICT (samsara_event_id) DO NOTHING")],
  ["catalog locks SPN 110", catalogTs.includes("spn: 110")],
  ["catalog locks SPN 974", catalogTs.includes("spn: 974")],
  ["auto WO type engine_diagnostic", autoWoTs.includes("'engine_diagnostic'")],
  ["auto WO severity column update", autoWoTs.includes("SET severity")],
  ["migration table", migrationSql.includes("integrations.engine_fault_events")],
  ["migration RLS", migrationSql.includes("identity.is_lucia_bypass()")],
  ["migration fault_code column", migrationSql.includes("fault_code")],
  ["package verify script", packageJson.includes("verify:cap-8-engine-fault-auto-wo")],
  ["CI gate", ciYml.includes("verify:cap-8-engine-fault-auto-wo")],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else {
    console.error(`✗ FAIL: ${label}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("GAP-58 CAP-8 engine fault auto WO guard: PASS");
