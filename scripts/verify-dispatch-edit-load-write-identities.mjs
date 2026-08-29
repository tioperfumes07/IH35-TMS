#!/usr/bin/env node
import { readFileSync } from "node:fs";

const service = readFileSync("apps/backend/src/dispatch/update-load.service.ts", "utf8");
const routes = readFileSync("apps/backend/src/dispatch/loads.routes.ts", "utf8");

function verify(s = service, r = routes) {
  const failures = [];
  const replaceStart = s.indexOf("async function replaceStops");
  const replaceEnd = s.indexOf("export type UpdateDispatchLoadResult", replaceStart);
  const replace = replaceStart >= 0 && replaceEnd > replaceStart ? s.slice(replaceStart, replaceEnd) : "";
  const existingStart = replace.indexOf("if (existingId)");
  const existingEnd = replace.indexOf("} else {", existingStart);
  const existingWrite = existingStart >= 0 && existingEnd > existingStart ? replace.slice(existingStart, existingEnd) : "";
  const updateStart = s.indexOf("export async function updateDispatchLoad");
  const update = updateStart >= 0 ? s.slice(updateStart) : "";

  if (!/WHERE id = \$1::uuid AND load_id = \$26::uuid[\s\S]*RETURNING id::text/.test(existingWrite)) failures.push("existing-stop write must bind parent load and return identity");
  if (!/updatedStop\.rows\[0\]\?\.id !== existingId[\s\S]*E_LOAD_STOP_WRITE_CONFLICT/.test(existingWrite)) failures.push("existing-stop write must reject lost identity");
  if (!/id = ANY\(\$2::uuid\[\]\)[\s\S]*RETURNING id::text/.test(replace)) failures.push("archive must target the selected identities and return them");
  if (!/archivedStops\.rows\.length !== expectedIds\.size[\s\S]*E_LOAD_STOP_ARCHIVE_CONFLICT/.test(replace)) failures.push("archive must reject partial persistence");
  if (!/UPDATE mdata\.loads SET[\s\S]*operating_company_id = \$\$\{values\.length\}::uuid[\s\S]*RETURNING id::text/.test(update)) failures.push("load write must be company-scoped and return identity");
  if (!/updatedLoad\.rows\[0\]\?\.id !== loadId[\s\S]*E_LOAD_WRITE_CONFLICT/.test(update)) failures.push("load write must reject lost identity");
  for (const code of ["E_LOAD_WRITE_CONFLICT", "E_LOAD_STOP_WRITE_CONFLICT", "E_LOAD_STOP_ARCHIVE_CONFLICT"]) {
    if (!r.includes(code)) failures.push(`mounted route must map ${code}`);
  }
  if (!/reply\.code\(409\)\.send\(\{ error: code \}\)/.test(r)) failures.push("write conflicts must return HTTP 409");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    service.replace(" AND load_id = $26::uuid", ""),
    service.replace("RETURNING id::text\n        `,", "/* planted missing identity */\n        `,"),
    service.replace("id = ANY($2::uuid[])", "sequence_number > $2"),
    service.replace("archivedStops.rows.length !== expectedIds.size", "false"),
    service.replace("RETURNING id::text`,\n      values", "/* planted missing identity */`,\n      values"),
    service.replace("updatedLoad.rows[0]?.id !== loadId", "false"),
    routes.replace('"E_LOAD_STOP_ARCHIVE_CONFLICT"', '"PLANTED"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    const mutatedService = index === mutations.length - 1 ? service : mutation;
    const mutatedRoutes = index === mutations.length - 1 ? mutation : routes;
    if (mutation === (index === mutations.length - 1 ? routes : service) || verify(mutatedService, mutatedRoutes).length === 0) {
      throw new Error(`selftest mutation escaped: ${index + 1}`);
    }
  }
  console.log(`[verify-dispatch-edit-load-write-identities] SELFTEST PASS (${mutations.length}/${mutations.length})`);
}

const failures = verify();
if (failures.length) {
  console.error("[verify-dispatch-edit-load-write-identities] FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("[verify-dispatch-edit-load-write-identities] PASS");
