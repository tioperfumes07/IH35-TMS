#!/usr/bin/env node
/**
 * ROUND 326 item 4 — legal deadline + expiry alerts must drive a real dashboard surface.
 * Fails if the engine, route, FE page, or module tab is unwired.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runGuard, withTmpFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";


if (process.argv.includes("--selftest")) selftest();

// VERIFY_ROOT lets --selftest point the whole guard at a throwaway tree (never tracked source).
const ROOT = process.env.VERIFY_ROOT
  ? resolve(process.env.VERIFY_ROOT)
  : resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-legal-deadline-alerts";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

const P = {
  svc: "apps/backend/src/legal/legal-deadline-alerts.service.ts",
  routes: "apps/backend/src/legal/matters.routes.ts",
  api: "apps/frontend/src/api/legal-matters.ts",
  page: "apps/frontend/src/pages/legal/alerts/LegalDeadlineAlertsPage.tsx",
  tabs: "apps/frontend/src/pages/legal/LegalModuleTabs.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

const problems = [];
for (const rel of Object.values(P)) {
  if (!existsSync(resolve(ROOT, rel))) problems.push(`missing ${rel}`);
}
if (!problems.length) {
  const svc = read(P.svc);
  const routes = read(P.routes);
  const api = read(P.api);
  const page = read(P.page);
  const tabs = read(P.tabs);
  const manifest = read(P.manifest);

  if (!/export async function listLegalDeadlineAlerts/.test(svc)) problems.push("listLegalDeadlineAlerts missing");
  if (!/matter_deadlines/.test(svc)) problems.push("engine must read matter_deadlines");
  if (!/contract_signing_tokens/.test(svc)) problems.push("engine must read signature expiry");
  if (!/statute_of_limitations/.test(svc)) problems.push("engine must surface SOL");
  if (!/\/api\/v1\/legal\/deadline-alerts/.test(routes)) problems.push("GET deadline-alerts route missing");
  if (!/listLegalDeadlineAlerts/.test(routes)) problems.push("route not wired to engine");
  if (!/deadlineAlerts\(/.test(api)) problems.push("FE api deadlineAlerts missing");
  if (!/LegalDeadlineAlertsPage/.test(page)) problems.push("alerts page export missing");
  if (!/to: "\/legal\/alerts"/.test(tabs) && !/to: '\/legal\/alerts'/.test(tabs)) problems.push("LegalModuleTabs missing Alerts tab");
  if (!/path="\/legal\/alerts"/.test(manifest)) problems.push("manifest missing /legal/alerts route");
}

if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — deadline/expiry engine + route + /legal/alerts surface wired`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green). This guard resolves paths against its own ROOT, so the fixture is
// pointed at via VERIFY_ROOT, not cwd.
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = withTmpFixture({}, [], (tmp) =>
    runGuard(me, { cwd: tmp, env: { VERIFY_ROOT: tmp } }),
  );
  reportSelftest("verify-legal-deadline-alerts", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
