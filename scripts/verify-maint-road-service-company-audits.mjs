#!/usr/bin/env node
import fs from "node:fs";

const sources = {
  create: fs.readFileSync("apps/backend/src/maintenance/road-service/tickets.routes.ts", "utf8"),
  workOrder: fs.readFileSync("apps/backend/src/maintenance/road-service/wo-integration.ts", "utf8"),
};
const checks = [
  ["create", "maintenance.road_service_ticket.created", "operating_company_id: body.data.operating_company_id"],
  ["workOrder", "maintenance.road_service_ticket.wo_created", "operating_company_id: input.operatingCompanyId"],
];

function inspect(values) {
  return checks.flatMap(([key, event, company]) => {
    const value = values[key];
    const start = value.indexOf(`"${event}"`);
    if (start < 0) return [`missing ${event} audit`];
    return value.slice(start, start + 520).includes(company) ? [] : [`${event} audit omits route company`];
  });
}

const failures = inspect(sources);
if (failures.length) {
  console.error(`verify-maint-road-service-company-audits FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [key, event, company] of checks) {
    const value = sources[key];
    const start = value.indexOf(`"${event}"`);
    const companyIndex = value.indexOf(company, start);
    const mutant = { ...sources, [key]: `${value.slice(0, companyIndex)}PLANTED_SCOPE${value.slice(companyIndex + company.length)}` };
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${event}`);
  }
  console.log(`verify-maint-road-service-company-audits --selftest PASS (${checks.length}/${checks.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-road-service-company-audits PASS — ticket create and WO conversion audits retain canonical company");
