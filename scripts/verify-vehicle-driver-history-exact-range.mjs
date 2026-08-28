#!/usr/bin/env node
import fs from "node:fs";
const routeFile = "apps/backend/src/telematics/vehicle-driver-pairing.routes.ts";
const apiFile = "apps/frontend/src/api/vehicleDriverPairing.ts";
const componentFile = "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx";
function findings(read = (file) => fs.readFileSync(file, "utf8")) {
  const route = read(routeFile), api = read(apiFile), component = read(componentFile), out = [];
  if (!route.includes("limit: z.coerce.number().int().min(1).max(100).default(25)")) out.push("bounded limit missing");
  if (!route.includes("offset: z.coerce.number().int().min(0).default(0)")) out.push("offset missing");
  if (!route.includes("COUNT(*) OVER()::int AS total_count")) out.push("exact total missing");
  if (!/LIMIT \$\$\{limitParam\} OFFSET \$\$\{offsetParam\}/.test(route) || route.includes("LIMIT 250")) out.push("bound range missing");
  if (!api.includes('query.set("limit", String(params.limit))') || !api.includes('query.set("offset", String(params.offset))')) out.push("client range missing");
  if (!component.includes('queryKey: ["vehicle-driver-history", operatingCompanyId, unitId, driverId, days, page]')) out.push("page query identity missing");
  if (!component.includes("offset: page * pageSize")) out.push("selected offset missing");
  if (!component.includes("unit-driver-history-server-pager") || !component.includes("hidePager")) out.push("authoritative pager missing");
  if (!component.includes("useEffect(() => setPage(0), [operatingCompanyId, unitId, driverId, days])")) out.push("scope reset missing");
  if (!component.includes("historyQuery.isSuccess && !historyQuery.isFetching && page > 0 && rows.length === 0")) out.push("out-of-range recovery missing");
  return out;
}
if (process.argv.includes("--selftest")) {
  const files = [routeFile, apiFile, componentFile];
  const base = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
  const mutations = [
    (file, source) => file === routeFile ? source.replace("COUNT(*) OVER()::int AS total_count", "0::int AS total_count") : source,
    (file, source) => file === routeFile ? source.replace("OFFSET $${offsetParam}", "OFFSET 0") : source,
    (file, source) => file === routeFile ? source.replace("LIMIT $${limitParam}", "LIMIT 250") : source,
    (file, source) => file === apiFile ? source.replace('query.set("offset", String(params.offset))', "") : source,
    (file, source) => file === componentFile ? source.replace(", page]", "]") : source,
    (file, source) => file === componentFile ? source.replace("unit-driver-history-server-pager", "removed-pager") : source,
    (file, source) => file === componentFile ? source.replace("offset: page * pageSize", "offset: 0") : source,
    (file, source) => file === componentFile ? source.replace("page > 0 && rows.length === 0", "false") : source,
  ];
  for (const mutate of mutations) if (findings((file) => mutate(file, base[file])).length === 0) throw new Error("planted regression escaped guard");
  console.log(`verify-vehicle-driver-history-exact-range selftest: PASS (${mutations.length}/${mutations.length})`); process.exit(0);
}
const got = findings(); if (got.length) { console.error(got.join("\n")); process.exit(1); }
console.log("verify-vehicle-driver-history-exact-range: PASS");
