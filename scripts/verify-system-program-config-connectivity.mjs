#!/usr/bin/env node
/** @matrix-built {"modules":["system"],"cols":["connectivity"],"leafRe":"^(tab\.program|tab\.claude_coder|hop\.program_matrix)$","task":"VERTICAL-CONNECTIVITY-SYSTEM-PROGRAM-CONFIG"} */
import fs from "node:fs";

const page = fs.readFileSync("apps/frontend/src/pages/system/SystemModulePage.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/program-tracker.ts", "utf8");
const routes = fs.readFileSync("apps/backend/src/program/program-board.routes.ts", "utf8");
const tracker = fs.readFileSync("apps/backend/src/program/program-tracker.service.ts", "utf8");
const matrix = fs.readFileSync("apps/backend/src/program/module-matrix.service.ts", "utf8");
const manifest = fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");

function failures(pageSource = page) {
  return [
    ["program tab mounted", pageSource.includes('tab === "program" ? <ProgramTab data={data} />')],
    ["tracker client", pageSource.includes("queryFn: getProgramTracker") && api.includes('"/api/v1/program/tracker"')],
    ["authenticated tracker route", routes.includes('app.get("/api/v1/program/tracker"') && routes.includes("requireAuth(req, reply)")],
    ["versioned R2 source", tracker.includes("getObjectTextIfExists") && tracker.includes("loadReconFromR2")],
    [
      "claude read-only activity",
      /tab === "claude-coder"\s*\?\s*<ClaudeCoderTab\b[^>]*\bdata=\{data\}[^>]*\/>/.test(pageSource) &&
        /const\s+recentMerged\s*=\s*tracker\.data\?\.recent_merged\s*\?\?\s*\[\]/.test(pageSource) &&
        /rows=\{recentMerged\.slice\(0,\s*8\)\}/.test(pageSource),
    ],
    ["matrix drill-through", pageSource.includes('to="/program/matrix"')],
    ["matrix route mounted", manifest.includes('path="/program/matrix"')],
    ["matrix version source", matrix.includes('execSync("git rev-parse --short HEAD"')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["matrix drill-through", page.replace('to="/program/matrix"', 'to="/program/matrix-broken"')],
    ["claude read-only activity", page.replace('tab === "claude-coder"', 'tab === "claude-coder-broken"')],
    ["claude read-only activity", page.replace("tracker.data?.recent_merged", "tracker.data?.recent_removed")],
    ["claude read-only activity", page.replace("rows={recentMerged.slice(0, 8)}", "rows={[]}")],
  ];
  for (const [expected, planted] of mutations) {
    if (!failures(planted).includes(expected)) process.exit(1);
  }
  console.log("verify-system-program-config-connectivity selftest PASS — 4 route/activity mutations red");
  process.exit(0);
}
const missing = failures();
if (missing.length) {
  console.error(`verify-system-program-config-connectivity FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-system-program-config-connectivity PASS — System tabs→authenticated versioned config→matrix route");
