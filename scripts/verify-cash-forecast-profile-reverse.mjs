#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow"],"cols":["reverse_link"],"leafRe":"^cash-flow\\.panel\\.projection$","task":"VERTICAL-REVERSE-LINK-CASH-FORECAST-PROFILES"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  routes: read("apps/backend/src/forecast/cash-forecast-manual.routes.ts"),
  api: read("apps/frontend/src/api/forecast.ts"),
  panel: read("apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx"),
  reverse: read("apps/frontend/src/components/cash-flow/CashForecastReverseSection.tsx"),
  driver: read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  unit: read("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"),
  customer: read("apps/frontend/src/pages/CustomerDetail.tsx"),
  vendor: read("apps/frontend/src/pages/VendorDetail.tsx"),
};
function failures(s = files) { return [
  ["company-scoped entity filters", s.routes.includes("party_ref_id: z.string().uuid().optional()") && s.routes.includes("party_ref_id = $${values.length}::uuid") && s.routes.includes("ref_external_id = $${values.length}") && s.api.includes("for (const [key, value] of Object.entries(filters))")],
  ["exact entry filter and target", s.routes.includes("entry_id: z.string().uuid().optional()") && s.routes.includes("id = $${values.length}::uuid") && s.reverse.includes('kind="cash_forecast_entry"') && s.reverse.includes("id={entry.id}") && s.panel.includes('searchParams.get("entry_id")') && s.panel.includes("entry_id: entryId")],
  ["shared filtered reverse reader", s.reverse.includes("listForecastEntries(operatingCompanyId, undefined, undefined, filter)") && s.reverse.includes('queryKey: ["cash-forecast-reverse", operatingCompanyId, filter]')],
  ["driver and customer mounts", s.driver.includes('party_ref_kind: "driver", party_ref_id: id') && s.customer.includes('party_ref_kind: "customer", party_ref_id: id')],
  ["vendor and unit mounts", s.vendor.includes('party_ref_kind: "vendor", party_ref_id: vendor.id') && s.unit.includes('ref_kind: "unit", ref_external_id: id')],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, routes: files.routes.replace("party_ref_id = $${values.length}::uuid", "TRUE") }).includes("company-scoped entity filters"),
    failures({ ...files, panel: files.panel.replace("entry_id: entryId", "") }).includes("exact entry filter and target"),
    failures({ ...files, reverse: files.reverse.replace("listForecastEntries(operatingCompanyId, undefined, undefined, filter)", "listForecastEntries(operatingCompanyId)") }).includes("shared filtered reverse reader"),
    failures({ ...files, customer: "" }).includes("driver and customer mounts"),
    failures({ ...files, unit: "" }).includes("vendor and unit mounts"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-cash-forecast-profile-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-cash-forecast-profile-reverse selftest PASS — 5/5 filter/profile/target mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-cash-forecast-profile-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-cash-forecast-profile-reverse PASS — projections return from every canonical party/unit profile to an exact row");
