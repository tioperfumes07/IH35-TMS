#!/usr/bin/env node
/**
 * verify-fuel-card-overage-status-url-ret — ROUND 8.20 board19.
 * Card overage Back honors ?ret=; status cohort + has_je live in URL for KPI drills.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-fuel-card-overage-status-url-ret";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx";

export function check(src) {
  const f = [];
  if (!src) {
    f.push("CardOverageQueuePage.tsx missing");
    return f;
  }
  if (!/resolveBackHref/.test(src)) {
    f.push("resolveBackHref missing");
  }
  if (!/fuelBackHref/.test(src) || !/data-testid="fuel-card-overage-back"/.test(src)) {
    f.push("Back must use fuelBackHref + test id");
  }
  if (/to="\/fuel"/.test(src) && !/fuelBackHref/.test(src.replace(/to=\{fuelBackHref\}/g, ""))) {
    // hard-coded /fuel Back without resolve is FAIL when ret present
  }
  if (/Link to="\/fuel"/.test(src)) {
    f.push("Back still hard-codes to=\"/fuel\"");
  }
  if (!/export function parseOverageStatusParam/.test(src) || !/export function buildOverageStatusParam/.test(src)) {
    f.push("status URL helpers missing");
  }
  if (!/has_je/.test(src)) {
    f.push("has_je KPI cohort missing");
  }
  if (!/fuel-card-overage-kpi-je/.test(src) || !/applyKpiCohort/.test(src)) {
    f.push("With JE KPI must apply has_je cohort");
  }
  return f;
}

function selftest(live) {
  const cases = [
    ["no resolveBackHref", live.replace(/resolveBackHref/g, "xResolve")],
    ["hard Back", live.replace(/to=\{fuelBackHref\}/, 'to="/fuel"')],
    ["file deleted", ""],
  ];
  let pass = check(live).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(live));
  for (const [name, src] of cases) {
    if (check(src).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — card overage Back ret + status/has_je URL SoT`);
}
