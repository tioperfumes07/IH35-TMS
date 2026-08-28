#!/usr/bin/env node
import fs from "node:fs";

const DISPATCH_VIEW = "apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts";
const DRIVER_LOADS = "apps/backend/src/driver/loads.routes.ts";
const dispatchView = fs.readFileSync(DISPATCH_VIEW, "utf8");
const driverLoads = fs.readFileSync(DRIVER_LOADS, "utf8");

function failures(files) {
  const problems = [];
  const need = (file, token, label) => {
    if (!files[file].includes(token)) problems.push(`${file}: ${label}`);
  };
  for (const token of [
    "JOIN mdata.drivers drv ON drv.id = $2",
    "FROM mdata.driver_company_authorizations dispatch_view_dca",
    "dispatch_view_dca.driver_id = drv.id",
    "dispatch_view_dca.company_id = l.operating_company_id",
    "dispatch_view_dca.is_authorized = true",
    "dispatch_view_dca.deactivated_at IS NULL",
    "l.assigned_primary_driver_id = $2 OR l.assigned_secondary_driver_id = $2",
  ]) need(DISPATCH_VIEW, token, `shared dispatch-view contract missing ${token}`);

  for (const alias of ["driver_load_list_dca", "driver_load_detail_dca"]) {
    for (const suffix of [
      ".company_id = l.operating_company_id",
      ".is_authorized = true",
      ".deactivated_at IS NULL",
    ]) need(DRIVER_LOADS, `${alias}${suffix}`, `${alias} shared-company predicate missing ${suffix}`);
  }
  need(DRIVER_LOADS, "l.customer_id::text", "detail/list must preserve canonical customer FK");
  need(DRIVER_LOADS, "AND l.operating_company_id = $2::uuid", "accept pickup lookup must bind captured company");
  need(DRIVER_LOADS, "AND l.operating_company_id = $10::uuid", "signed acknowledgment must bind captured company");
  need(DRIVER_LOADS, "AND operating_company_id = $3::uuid", "accepted load UPDATE must bind captured company");
  need(DRIVER_LOADS, "if (!acceptedRes.rows[0])", "accept lifecycle must fail atomically on lost scope");
  need(DRIVER_LOADS, "operating_company_id: load.operating_company_id", "accept audit must retain company identity");
  return problems;
}

const real = { [DISPATCH_VIEW]: dispatchView, [DRIVER_LOADS]: driverLoads };
const errors = failures(real);
if (process.argv.includes("--selftest")) {
  if (errors.length) throw new Error(`clean failed:\n${errors.join("\n")}`);
  const mutations = [
    [DISPATCH_VIEW, "dispatch_view_dca.is_authorized = true", "dispatch_view_dca.is_authorized = false"],
    [DISPATCH_VIEW, "dispatch_view_dca.deactivated_at IS NULL", "dispatch_view_dca.deactivated_at IS NOT NULL"],
    [DRIVER_LOADS, "driver_load_list_dca.is_authorized = true", "driver_load_list_dca.is_authorized = false"],
    [DRIVER_LOADS, "driver_load_detail_dca.deactivated_at IS NULL", "driver_load_detail_dca.deactivated_at IS NOT NULL"],
    [DRIVER_LOADS, "AND l.operating_company_id = $2::uuid", ""],
    [DRIVER_LOADS, "AND l.operating_company_id = $10::uuid", ""],
    [DRIVER_LOADS, "AND operating_company_id = $3::uuid", ""],
    [DRIVER_LOADS, "if (!acceptedRes.rows[0])", "if (false)"],
    [DRIVER_LOADS, "operating_company_id: load.operating_company_id", "operating_company_id: driver.id"],
    [DRIVER_LOADS, "l.customer_id::text", "NULL::text AS customer_id"],
  ];
  const escaped = mutations.filter(([file, before, after]) => {
    const fixture = { ...real, [file]: real[file].replaceAll(before, after) };
    return failures(fixture).length === 0;
  });
  if (escaped.length) throw new Error(`${escaped.length}/${mutations.length} mutations escaped`);
  console.log(`PASS verify-driver-pwa-shared-dispatch-view --selftest (${mutations.length}/${mutations.length})`);
  process.exit(0);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("PASS verify-driver-pwa-shared-dispatch-view");
