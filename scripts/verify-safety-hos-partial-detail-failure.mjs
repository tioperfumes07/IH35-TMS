#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rel = "apps/frontend/src/pages/safety/HoursOfServicePage.tsx";
const source = fs.readFileSync(path.join(root, rel), "utf8");

function failures(src) {
  const required = [
    ["row tracks per-driver telemetry failure", "telemetryUnavailable: boolean"],
    ["successful rows explicitly clear failure", "telemetryUnavailable: false"],
    ["failed detail reads explicitly mark failure", "return { ...base, telemetryUnavailable: true }"],
    ["aggregate reports failed driver count", "failedDriverCount: rows.filter((row) => row.telemetryUnavailable).length"],
    ["dashboard derives incomplete state", "const fleetIncomplete = failedDriverCount > 0"],
    ["on-duty KPI fails closed", 'fleetQuery.isError || fleetIncomplete ? "—" : metrics.onDuty'],
    ["off-duty KPI fails closed", 'fleetQuery.isError || fleetIncomplete ? "—" : metrics.offDuty'],
    ["cap KPI fails closed", 'fleetQuery.isError || fleetIncomplete ? "—" : metrics.approachingCap'],
    ["near-violation panel fails closed", "!fleetQuery.isError && !fleetIncomplete && metrics.nearViolations.length > 0"],
    ["partial outage is visible", 'title="Some driver HOS clocks are unavailable"'],
    ["partial outage exposes retry", "onRetry={() => void fleetQuery.refetch()}"],
    ["duty cell distinguishes outage", 'row.telemetryUnavailable ? "Unavailable" : formatDutyStatus'],
    ["drive-left cell distinguishes outage", 'row.telemetryUnavailable ? "Unavailable" : formatDriveRemaining'],
    ["clock cell distinguishes outage", 'row.telemetryUnavailable ? "Unavailable" : row.clockStatus'],
  ];
  return required.filter(([, needle]) => !src.includes(needle)).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["remove failure marker", "telemetryUnavailable: true", "telemetryUnavailable: false"],
    ["restore zero-looking on-duty KPI", 'fleetQuery.isError || fleetIncomplete ? "—" : metrics.onDuty', 'fleetQuery.isError ? "—" : metrics.onDuty'],
    ["hide partial warning", 'title="Some driver HOS clocks are unavailable"', 'title="Fleet HOS"'],
    ["restore ambiguous duty cell", 'row.telemetryUnavailable ? "Unavailable" : formatDutyStatus', "formatDutyStatus"],
  ];
  const missed = mutations.filter(([, from, to]) => failures(source.replace(from, to)).length === 0);
  if (missed.length) {
    console.error(`verify-safety-hos-partial-detail-failure SELFTEST FAILED: ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-safety-hos-partial-detail-failure selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(source);
if (missing.length) {
  console.error(`verify-safety-hos-partial-detail-failure FAILED:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-safety-hos-partial-detail-failure PASS — partial driver-detail outages cannot masquerade as valid empty HOS data");
