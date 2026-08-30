#!/usr/bin/env node
/**
 * Legal (+fuel honesty companion) reverse_link remainder.
 * Built: legal templates.detail (user EntityLink on audit). Fuel relay honesty-only.
 *
 * @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leafRe":"^templates\\.detail$","task":"VERTICAL-REVERSE-LINK-legal-fuel-remainder","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-legal-fuel-reverse-link-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-fuel-reverse-link-remainder";
const FILE = "apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx";
const FUEL_REVERSE_FILE = "apps/frontend/src/components/fuel/FuelTransactionsReverseSection.tsx";

function fails(src) {
  const out = [];
  if (!/EntityLink/.test(src)) out.push("no EntityLink");
  if (!/kind="user"/.test(src)) out.push("no user EntityLink");
  return out;
}

function fuelFails(src) {
  const out = [];
  if (!/const rows = fuelQ\.isError \? \[\] : \(fuelQ\.data\?\.transactions \?\? \[\]\)/.test(src)) {
    out.push("fuel reverse failure does not suppress stale cached rows");
  }
  if (!/<ListErrorState[\s\S]*?userFacingApiError\(fuelQ\.error[\s\S]*?onRetry=\{\(\) => void fuelQ\.refetch\(\)\}/.test(src)) {
    out.push("fuel reverse GET failure has no detailed retry path");
  }
  if (!/!fuelQ\.isLoading\s*&&\s*!fuelQ\.isError\s*&&\s*rows\.length === 0/.test(src)) {
    out.push("fuel reverse empty state is not gated away from failures");
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const fuelLive = fs.readFileSync(path.join(ROOT, FUEL_REVERSE_FILE), "utf8");
  if (fails(live).length) {
    console.error(`${LABEL} SELFTEST FAIL live`);
    process.exit(1);
  }
  if (fails("// poison").length < 2) {
    console.error(`${LABEL} SELFTEST FAIL poison`);
    process.exit(1);
  }
  if (fuelFails(fuelLive).length || !fuelFails(fuelLive.replace("onRetry={() => void fuelQ.refetch()}", "onRetry={() => undefined}")).length) {
    console.error(`${LABEL} SELFTEST FAIL fuel retry mutation`);
    process.exit(1);
  }
  if (!fuelFails(fuelLive.replace("fuelQ.isError ? []", "false ? []")).includes("fuel reverse failure does not suppress stale cached rows")) {
    console.error(`${LABEL} SELFTEST FAIL fuel stale-row mutation`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const f = [
  ...fails(fs.readFileSync(path.join(ROOT, FILE), "utf8")),
  ...fuelFails(fs.readFileSync(path.join(ROOT, FUEL_REVERSE_FILE), "utf8")),
];
if (f.length) {
  console.error(`${LABEL} FAIL:\n- ${f.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — legal templates.detail reverse_link ratcheted`);
