#!/usr/bin/env node
/** SAFETY-F6489 — Anomaly severity filter uses shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/safety/anomaly/AnomalyDashboard.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to AnomalyDashboard");
  for (const token of [
    'htmlFor="anomaly-severity-filter"',
    'id="anomaly-severity-filter"',
    'dataTestId="anomaly-severity-filter"',
    "onChange={setSeverity}",
    'params.delete("severity")',
    'params.set("severity", next)',
    "severity ? `&severity=${severity}` : \"\"",
    'queryKey: ["anomaly-alerts", operatingCompanyId, severity, page]',
    'limit=${pageSize}&offset=${page * pageSize}',
    'data-testid="anomaly-alerts-server-pager"',
  ]) if (!source.includes(token)) throw new Error(`missing Anomaly severity contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["constant severity", 'params.set("severity", next)', 'params.set("severity", "critical")'],
    ["page omitted from query key", 'queryKey: ["anomaly-alerts", operatingCompanyId, severity, page]', 'queryKey: ["anomaly-alerts", operatingCompanyId, severity]'],
    ["offset omitted from request", 'limit=${pageSize}&offset=${page * pageSize}', 'limit=${pageSize}'],
  ];
  for (const [name, from, to] of mutations) {
    const planted = diskSource.replace(from, to);
    if (planted === diskSource) throw new Error(`selftest failed to plant ${name}`);
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      env: { ...process.env, SAFETY_F6489_PLANTED_SOURCE: planted },
      encoding: "utf8",
    });
    if (child.status === 0) throw new Error(`selftest failed: planted ${name} stayed green`);
  }
  console.log(`verify-safety-anomaly-severity-combobox --selftest PASS — ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

assertContract(process.env.SAFETY_F6489_PLANTED_SOURCE ?? diskSource);
console.log("verify-safety-anomaly-severity-combobox PASS — URL and selected-company query remain aligned");
