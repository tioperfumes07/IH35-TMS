#!/usr/bin/env node
/** Ratchet LV-MAINT-PAST-DUE-PHANTOM: PM alert ledger is the overdue source, never a phantom WO due_date. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const KPI = "apps/backend/src/kpi/canonical-kpis.ts";

function verify(source) {
  const failures = [];
  const fn = source.match(/export async function countPastDueMaintenanceWorkOrders[\s\S]*?^}/m)?.[0] ?? "";
  if (!fn) failures.push("canonical past-due counter is missing");
  if (!/JOIN maintenance\.pm_alerts pa/.test(fn)) failures.push("counter must join the canonical PM alert ledger");
  if (!/pa\.scheduled_work_order_id = w\.id/.test(fn)) failures.push("counter must use the PM-alert forward WO FK");
  if (!/pa\.operating_company_id = w\.operating_company_id/.test(fn)) failures.push("PM alert and WO company scopes must agree");
  if (!/w\.operating_company_id = \$1::uuid/.test(fn)) failures.push("counter must explicitly scope the WO read");
  if (!/pa\.triggered_at < CURRENT_DATE/.test(fn)) failures.push("past-due cutoff must use the ledger trigger date");
  if (/w\.due_date/.test(fn)) failures.push("counter references phantom maintenance.work_orders.due_date");
  if (!/count\(DISTINCT w\.id\)/i.test(fn)) failures.push("counter must not double-count a WO with multiple alert rows");
  return failures;
}

const source = fs.readFileSync(path.join(ROOT, KPI), "utf8");
const failures = verify(source);
if (failures.length) {
  console.error(`FAIL verify-maint-past-due-kpi-source:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("JOIN maintenance.pm_alerts pa", "JOIN maintenance.pm_schedules pa"),
    source.replace("pa.scheduled_work_order_id = w.id", "pa.id = w.id"),
    source.replace("pa.operating_company_id = w.operating_company_id", "TRUE"),
    source.replace("pa.triggered_at < CURRENT_DATE", "w.due_date < CURRENT_DATE"),
    source.replace("count(DISTINCT w.id)", "count(*)"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (escaped !== mutations.length) {
    console.error(`FAIL verify-maint-past-due-kpi-source selftest: caught ${escaped}/${mutations.length}`);
    process.exit(1);
  }
  const marker = fs.mkdtempSync(path.join(os.tmpdir(), "maint-past-due-guard-"));
  fs.rmSync(marker, { recursive: true, force: true });
  console.log(`PASS verify-maint-past-due-kpi-source selftest: ${escaped}/${mutations.length} planted defects caught`);
} else {
  console.log("PASS verify-maint-past-due-kpi-source");
}
