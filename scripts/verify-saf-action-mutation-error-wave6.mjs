#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
const LABEL = "verify-saf-action-mutation-error-wave6";
const CHECKS = [
  { file: "apps/frontend/src/pages/safety/DrugAlcoholDashboard.tsx", needles: ["userFacingApiError", "drawMutation.isError", "drug-alcohol-dashboard-draw-error"] },
  { file: "apps/frontend/src/pages/safety/anomaly/RuleEditor.tsx", needles: ["userFacingApiError", "seedError", "anomaly-seed-defaults-error"] },
  { file: "apps/frontend/src/pages/safety/anomaly/AnomalyDashboard.tsx", needles: ["userFacingApiError", "actionError", "anomaly-dashboard-action-error"] },
];
function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}
function selftest() {
  const bad = "drawMutation.mutate()";
  const good = CHECKS[0].needles.join("\n");
  const tmp = ".tmp-saf-wave6-selftest.tsx";
  fs.writeFileSync(tmp, bad);
  try { if (assertFile(tmp, ["drawMutation.isError"]).length === 0) { console.error(LABEL+" SELFTEST FAIL bad"); process.exit(1);} } finally { fs.unlinkSync(tmp); }
  fs.writeFileSync(tmp, good);
  try { if (assertFile(tmp, CHECKS[0].needles).length > 0) { console.error(LABEL+" SELFTEST FAIL good"); process.exit(1);} } finally { fs.unlinkSync(tmp); }
  console.log(LABEL+" selftest PASS");
}
if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const errors = [];
for (const c of CHECKS) {
  if (!fs.existsSync(c.file)) errors.push("missing "+c.file);
  else errors.push(...assertFile(c.file, c.needles));
}
if (errors.length) { console.error(LABEL+" FAIL:"); for (const e of errors) console.error("  - "+e); process.exit(1); }
console.log(LABEL+" PASS — dashboard/rule/anomaly action mutations surface isError");
