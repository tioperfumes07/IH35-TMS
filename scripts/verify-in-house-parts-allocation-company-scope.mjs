#!/usr/bin/env node
import fs from "node:fs";

const serviceFile = "apps/backend/src/maintenance/two-section-service.ts";
const routeFile = "apps/backend/src/maintenance/work-orders.routes.ts";
const service = fs.readFileSync(serviceFile, "utf8");
const route = fs.readFileSync(routeFile, "utf8");

function inspect(serviceSource, routeSource) {
  const failures = [];
  const start = serviceSource.indexOf("export async function allocateInHouseFromWO");
  const end = serviceSource.indexOf("\n}\n", start);
  const block = start >= 0 && end >= 0 ? serviceSource.slice(start, end) : "";
  const required = [
    ["operatingCompanyId: string", "allocator omits company argument"],
    ["wo.operating_company_id = $2::uuid", "WO-line source lacks company predicate"],
    ["p.operating_company_id = $2::uuid", "inventory target lacks company predicate"],
    ["[woUuid, operatingCompanyId]", "allocation query omits company bind"],
    ["operating_company_id: operatingCompanyId", "allocation audit omits company"],
  ];
  for (const [needle, message] of required) if (!block.includes(needle)) failures.push(message);
  const caller = "allocateInHouseFromWO(client as never, user.uuid, created.woUuid, body.header.operating_company_id)";
  if (!routeSource.includes(caller)) failures.push("canonical caller does not forward header company");
  return failures;
}

const failures = inspect(service, route);
if (failures.length) {
  console.error(`verify-in-house-parts-allocation-company-scope FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    [service, route, "operatingCompanyId: string", "PLANTED_ARG"],
    [service, route, "wo.operating_company_id = $2::uuid", "PLANTED_WO_SCOPE"],
    [service, route, "p.operating_company_id = $2::uuid", "PLANTED_TARGET_SCOPE"],
    [service, route, "[woUuid, operatingCompanyId]", "[woUuid]"],
    [service, route, "operating_company_id: operatingCompanyId", "PLANTED_AUDIT"],
    [service, route, "allocateInHouseFromWO(client as never, user.uuid, created.woUuid, body.header.operating_company_id)", "allocateInHouseFromWO(client as never, user.uuid, created.woUuid)"],
  ];
  for (const [s, r, needle, replacement] of mutations) {
    const allocatorStart = s.indexOf("export async function allocateInHouseFromWO");
    const serviceNeedle = s.indexOf(needle, allocatorStart);
    const routeNeedle = r.indexOf(needle);
    const mutateService = serviceNeedle >= 0
      ? `${s.slice(0, serviceNeedle)}${replacement}${s.slice(serviceNeedle + needle.length)}`
      : s;
    const mutateRoute = routeNeedle >= 0
      ? `${r.slice(0, routeNeedle)}${replacement}${r.slice(routeNeedle + needle.length)}`
      : r;
    if (inspect(mutateService, mutateRoute).length === 0) throw new Error(`selftest missed ${needle}`);
  }
  console.log(`verify-in-house-parts-allocation-company-scope --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}
console.log("verify-in-house-parts-allocation-company-scope PASS — WO parts allocation and audit are company-scoped");
