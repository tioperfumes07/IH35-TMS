#!/usr/bin/env node
/**
 * ROUND 326 item 4 — legal deadline + expiry alerts must drive a real dashboard surface.
 * Fails if the engine, route, FE page, or module tab is unwired.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
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
