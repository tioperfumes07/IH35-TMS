#!/usr/bin/env node
/**
 * MAINT-DTC-AUTO-WO-SILENT-RANGE follow-up (PR #10089 introduced this exact defect while shipping
 * that fix): `severe-alerts` and `dtc-auto-work-orders` each declare one `const <name> = await
 * withCompany(...)` binding and must return that SAME binding. #10089's edit renamed severe-alerts'
 * binding rows -> result but left its `return { alerts: rows }` unchanged (ReferenceError: rows is
 * not defined at request time — tsc caught it, a live call would have thrown 500), and separately
 * changed dtc-auto-work-orders' final `return` to `result` while leaving its binding named `rows`
 * (the same ReferenceError, mirrored). Both routes have zero backend request/response tests, so
 * this static source guard is the only regression lock — it fails on the same variable-name typo
 * class even if a future edit renames these bindings again.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/maintenance/dashboard.routes.ts";

function checkRoute(source, routeName, expectedBinding) {
  const routeStart = source.indexOf(`app.get("${routeName}"`);
  if (routeStart === -1) return [`${routeName}: route not found`];
  const nextRoute = source.indexOf('app.get("', routeStart + 1);
  const body = source.slice(routeStart, nextRoute === -1 ? undefined : nextRoute);

  const declMatch = body.match(/const\s+(\w+)\s*=\s*await\s+withCompany\(/);
  if (!declMatch) return [`${routeName}: withCompany binding not found`];
  const declared = declMatch[1];
  if (declared !== expectedBinding) return [`${routeName}: expected binding name '${expectedBinding}', found '${declared}'`];

  // The final `return ...;` before the route's closing `});` must reference the declared binding.
  const returns = [...body.matchAll(/\breturn\s+([^;]+);/g)].map((m) => m[1].trim());
  const finalReturn = returns[returns.length - 1];
  if (!finalReturn || !new RegExp(`\\b${declared}\\b`).test(finalReturn)) {
    return [`${routeName}: final return ('${finalReturn}') does not reference declared binding '${declared}'`];
  }
  return [];
}

function failures(source) {
  return [
    ...checkRoute(source, "/api/v1/maintenance/dashboard/severe-alerts", "result"),
    ...checkRoute(source, "/api/v1/maintenance/dashboard/dtc-auto-work-orders", "rows"),
  ];
}

const live = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["severe-alerts return uses stale name", live.replace("return { alerts: result };", "return { alerts: rows };")],
    ["dtc-auto-work-orders return uses stale name", live.replace("    return rows;\n  });\n\n  app.get(\"/api/v1/maintenance/fleet-table/kpis\"", "    return result;\n  });\n\n  app.get(\"/api/v1/maintenance/fleet-table/kpis\"")],
  ];
  const escaped = [];
  for (const [name, mutant] of mutations) {
    if (mutant === live) { escaped.push(`${name}: mutation anchor missing`); continue; }
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`verify-maintenance-dashboard-route-return-names SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`verify-maintenance-dashboard-route-return-names SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`verify-maintenance-dashboard-route-return-names FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-maintenance-dashboard-route-return-names PASS — severe-alerts and dtc-auto-work-orders each return their own declared withCompany binding");
