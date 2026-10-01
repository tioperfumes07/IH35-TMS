#!/usr/bin/env node
/** E-42 — Dashcam viewer (Round 306). Ops; --selftest. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-e42-dashcam-viewer";
const SELFTEST = process.argv.includes("--selftest");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const routes = read("apps/backend/src/telematics/dashcam-on-demand.routes.ts");
  if (!/\/api\/v1\/telematics\/dashcam-clips/.test(routes)) f.push("BE missing list route");
  const page = read("apps/frontend/src/pages/safety/DashcamViewerPage.tsx");
  if (!/dashcam-viewer-page/.test(page)) f.push("page missing testid");
  if (!/\/api\/v1\/telematics\/dashcam-clips/.test(page)) f.push("page must call list API");
  if (!/<video/.test(page)) f.push("page must play video");
  const tabs = read("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts");
  if (!/id: "dashcam"/.test(tabs) || !/\/safety\/dashcam/.test(tabs)) f.push("alias tab missing");
  if (!/SAFETY_ALIAS_TABS[\s\S]*dashcam/.test(tabs)) f.push("dashcam must be ALIAS not GROUPS");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  if (!/path="dashcam"/.test(manifest) || !/DashcamViewerPage/.test(manifest)) f.push("manifest mount missing");
  return f;
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} ${SELFTEST ? "SELFTEST " : ""}FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}${SELFTEST ? " SELFTEST" : ""}: OK`);
process.exit(0);
