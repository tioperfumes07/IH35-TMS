#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["load","connectivity"],"leaves":["dispatch.panel.load_shuttle_legs"],"task":"LEAD-443.266-A-LOAD-SHUTTLE-LEGS-PANEL","vertical":"class-sweep"} */
/**
 * LEAD 443.266-A item 3 — Required leaf dispatch.panel.load_shuttle_legs (Load drawer → Stops record → "Local yard shuttle").
 *   R1 load: the panel reads ITS OWN load's legs — keyed and fetched by the drawer's loadId through getLoadShuttleLegs,
 *      whose endpoint is /dispatch/loads/:id/shuttle-legs.
 *   R2 load: the backend list is entity- and load-scoped and void-aware
 *      (operating_company_id = $1 AND load_id = $2 AND voided_at IS NULL) under withCompanyScope.
 *   R3 connectivity: a failed read shows a ListErrorBanner with retry — never the silent "no shuttle" null.
 *   R4 the panel is mounted in LoadStopsRecordTab with the drawer's loadId.
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  tab: "apps/frontend/src/components/dispatch/LoadStopsRecordTab.tsx",
  api: "apps/frontend/src/api/dispatch.ts",
  routes: "apps/backend/src/dispatch/load-shuttle-leg.routes.ts",
  service: "apps/backend/src/dispatch/load-shuttle-leg.service.ts",
};

export function audit(s) {
  const f = [];
  const need = (rule, cond, msg) => {
    if (!cond) f.push(`${rule}: ${msg}`);
  };
  const start = s.tab.indexOf("function LoadShuttleLegsPanel(");
  const panel = start >= 0 ? s.tab.slice(start, s.tab.indexOf("\n}\n", start)) : "";
  need("R1", panel.length > 0, "LoadShuttleLegsPanel not found");
  need("R1", /queryKey: \["load-shuttle-legs", loadId, operatingCompanyId\]/.test(panel) && /getLoadShuttleLegs\(loadId, operatingCompanyId\)/.test(panel), "the panel does not read its own load's legs");
  need("R1", /\/api\/v1\/dispatch\/loads\/\$\{encodeURIComponent\(loadId\)\}\/shuttle-legs\?operating_company_id=/.test(s.api), "getLoadShuttleLegs is not the load-scoped endpoint");
  need("R2", /app\.get\("\/api\/v1\/dispatch\/loads\/:id\/shuttle-legs"[\s\S]{0,600}withCompanyScope\([\s\S]{0,160}listLoadShuttleLegs\(client as never, q\.data\.operating_company_id, p\.data\.id\)/.test(s.routes), "the GET route is not company-scoped to the path load");
  need("R2", /sl\.operating_company_id = \$1::uuid AND sl\.load_id = \$2::uuid AND sl\.voided_at IS NULL/.test(s.service), "the shuttle list is not entity + load scoped and void-aware");
  need("R3", /if \(q\.isError\) \{[\s\S]{0,200}<ListErrorBanner [^>]*onRetry=\{\(\) => void q\.refetch\(\)\}/.test(panel), "a failed read is hidden (silent null) instead of a retryable error");
  need("R3", panel.indexOf("if (q.isError)") >= 0 && panel.indexOf("if (q.isError)") < panel.indexOf("if (!legs.length) return null"), "the error check comes after the empty-return, so errors still vanish");
  need("R4", /<LoadShuttleLegsPanel loadId=\{loadId\} operatingCompanyId=\{operatingCompanyId\} \/>/.test(s.tab), "the panel is not mounted with the drawer's loadId");
  return f;
}

function load() {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) out[k] = fs.readFileSync(path.join(ROOT, rel), "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = load();
  const base = audit(real).length;
  const plant = (key, from, to) => (real[key].includes(from) ? audit({ ...real, [key]: real[key].replace(from, to) }).length > base : null);
  const cases = [
    ["another load's legs FAIL", plant("tab", "getLoadShuttleLegs(loadId, operatingCompanyId)", "getLoadShuttleLegs(otherLoadId, operatingCompanyId)")],
    ["unscoped backend list FAILS", plant("service", "sl.operating_company_id = $1::uuid AND sl.load_id = $2::uuid AND sl.voided_at IS NULL", "sl.load_id = $2::uuid")],
    ["voided legs shown FAIL", plant("service", "sl.load_id = $2::uuid AND sl.voided_at IS NULL", "sl.load_id = $2::uuid")],
    ["silent fetch error FAILS", plant("tab", "if (q.isError) {", "if (false) {")],
    ["panel unmounted FAILS", plant("tab", "<LoadShuttleLegsPanel loadId={loadId} operatingCompanyId={operatingCompanyId} />", "")],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? "verify-load-shuttle-legs-panel-wired --selftest FAIL" : `verify-load-shuttle-legs-panel-wired --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = audit(load());
if (failures.length) {
  console.error(`verify-load-shuttle-legs-panel-wired: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log("verify-load-shuttle-legs-panel-wired: OK — the shuttle panel reads its own load's legs (entity + load scoped, void-aware) and shows a fetch error (R1–R4)");
