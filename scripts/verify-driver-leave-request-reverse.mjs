#!/usr/bin/env node
import fs from "node:fs";

const files = {
  service: fs.readFileSync("apps/backend/src/safety/driver-scheduler.service.ts", "utf8"),
  routes: fs.readFileSync("apps/backend/src/safety/driver-scheduler.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/driver-scheduler.ts", "utf8"),
  reverse: fs.readFileSync("apps/frontend/src/components/safety/DriverTempCoverReverseSection.tsx", "utf8"),
};

function inspect(source) {
  const failures = [];
  const checks = [
    ["service", /export async function listDriverLeaveRequests[\s\S]{0,700}r\.operating_company_id = \$1::uuid[\s\S]{0,120}r\.driver_id = \$2::uuid/, "driver leave reader is not scoped by company plus canonical driver FK"],
    ["service", /listDriverLeaveRequests[\s\S]{0,1300}mdata\.resolve_driver_label_same_company\(r\.driver_id, r\.operating_company_id\)/, "driver leave reader lacks canonical historical driver label"],
    ["service", /listDriverLeaveRequests[\s\S]{0,1500}ORDER BY r\.created_at DESC, r\.id DESC[\s\S]{0,100}LIMIT \$3::int OFFSET \$4::int/, "driver leave reverse is not exact server paged"],
    ["routes", /"\/api\/v1\/safety\/scheduler\/requests"[\s\S]{0,650}driver_id: z\.string\(\)\.uuid\(\)\.optional\(\)/, "office request route does not accept a validated driver filter"],
    ["routes", /listDriverLeaveRequests\(client, parsed\.data\.operating_company_id, parsed\.data\.driver_id!, parsed\.data\.limit, parsed\.data\.offset\)/, "office request route does not forward the exact driver/page filter"],
    ["api", /listDriverRequests\(operatingCompanyId: string, driverId: string[\s\S]{0,420}driver_id: driverId/, "frontend API does not submit the canonical driver FK"],
    ["reverse", /queryKey: \["safety", "reverse", "leave-requests", operatingCompanyId, driverId\][\s\S]{0,180}listDriverRequests\(operatingCompanyId, driverId\)/, "driver profile does not read its leave-request reverse"],
    ["reverse", /data-testid="driver-leave-requests-reverse"[\s\S]{0,1600}<EntityLink kind="scheduler_request" id=\{requestId \|\| null\} label=\{requestNumber\}/, "driver profile does not drill to the exact leave request"],
    ["reverse", /leaveQuery\.isError[\s\S]{0,300}Could not load leave requests for this driver[\s\S]{0,260}No leave requests are linked to this driver/, "driver leave reverse lacks explicit error and empty states"],
  ];
  for (const [key, pattern, message] of checks) if (!pattern.test(source[key])) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["service", "r.operating_company_id = $1::uuid"],
    ["service", "r.driver_id = $2::uuid"],
    ["service", "mdata.resolve_driver_label_same_company(r.driver_id, r.operating_company_id)"],
    ["routes", "driver_id: z.string().uuid().optional()"],
    ["routes", "listDriverLeaveRequests(client, parsed.data.operating_company_id, parsed.data.driver_id!, parsed.data.limit, parsed.data.offset)"],
    ["api", "driver_id: driverId"],
    ["reverse", 'listDriverRequests(operatingCompanyId, driverId)'],
    ["reverse", '<EntityLink kind="scheduler_request" id={requestId || null} label={requestNumber}'],
  ];
  for (const [key, token] of mutations) {
    if (!files[key].includes(token)) throw new Error(`selftest fixture missing ${key}:${token}`);
    const changed = { ...files, [key]: files[key].split(token).join("PLANTED_DEFECT") };
    if (!inspect(changed).length) throw new Error(`planted defect survived ${key}:${token}`);
  }
  console.log(`verify-driver-leave-request-reverse selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
} else {
  const failures = inspect(files);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-driver-leave-request-reverse PASS — driver↔leave request is scoped, paged, human-labelled, and drillable");
}
