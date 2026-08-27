import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/labor.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const tracker = fs.readFileSync("apps/frontend/src/components/maintenance/LaborTracker.tsx", "utf8");
const panel = fs.readFileSync("apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx", "utf8");

function problems(b = backend, a = api, t = tracker, p = panel) {
  const routeStart = b.indexOf('app.get("/api/v1/maintenance/labor-codes"');
  const routeEnd = b.indexOf('app.post("/api/v1/work-orders/', routeStart);
  const route = b.slice(routeStart, routeEnd);
  const checks = [
    [routeStart >= 0 && routeEnd > routeStart, "mounted labor-code route"],
    [!route.match(/LIMIT\s+200\b/), "silent 200 cap removed"],
    [route.includes("operating_company_id = $1::uuid AND is_active = true"), "company and active scope"],
    [route.includes("ORDER BY sort_order ASC, display_name ASC, id ASC"), "stable canonical order"],
    [a.includes("listMaintenanceLaborCodes") && a.includes("/api/v1/maintenance/labor-codes"), "typed canonical client"],
    [[t, p].every((source) => source.includes("listMaintenanceLaborCodes(operatingCompanyId)")), "both mounted trackers use complete feed"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("ORDER BY sort_order ASC, display_name ASC, id ASC", "ORDER BY sort_order ASC LIMIT 200"), api, tracker, panel],
    [backend.replace("operating_company_id = $1::uuid AND is_active = true", "is_active = true"), api, tracker, panel],
    [backend.replace("ORDER BY sort_order ASC, display_name ASC, id ASC", "ORDER BY sort_order ASC"), api, tracker, panel],
    [backend, api.replace("/api/v1/maintenance/labor-codes", "/api/v1/legacy/labor-codes"), tracker, panel],
    [backend, api, tracker.replace("listMaintenanceLaborCodes(operatingCompanyId)", "Promise.resolve([])"), panel],
    [backend, api, tracker, panel.replace("listMaintenanceLaborCodes(operatingCompanyId)", "Promise.resolve([])")],
  ];
  const escaped = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped: ${escaped.join(",")}`);
  console.log(`verify-maintenance-labor-codes-complete-feed selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-maintenance-labor-codes-complete-feed FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-labor-codes-complete-feed PASS — both mounted WO labor trackers receive the complete scoped canonical code feed");
