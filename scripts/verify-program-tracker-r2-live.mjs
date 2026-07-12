#!/usr/bin/env node
/**
 * GUARD: the Program Tracker per-block status must be sourced LIVE from the R2 snapshot (refreshed every
 * merge by CI), with the committed file as cold fallback — so the numbers can't silently freeze again.
 *
 * Locks (2026-07-12):
 *  - program-tracker.service.ts reads the tracker artifact from R2 (getObjectTextIfExists) before the
 *    committed file, keyed program-tracker/block-reconciliation-data.json.
 *  - The route awaits computeProgramTrackerLive (the R2-first path), not the bare sync compute.
 *  - The sync workflow regenerates (reconcile:blocks, where gh gives the merged-PR DONE signal) AND
 *    uploads the artifact to R2 (tracker:sync:r2).
 *
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SVC = path.join(root, "apps/backend/src/program/program-tracker.service.ts");
const ROUTE = path.join(root, "apps/backend/src/program/program-board.routes.ts");
const WF = path.join(root, ".github/workflows/program-board-sync.yml");
const UPLOAD = path.join(root, "scripts/sync-tracker-r2.mjs");

function assertAll({ svc, route, wf, uploadExists }) {
  const errors = [];
  if (!/getObjectTextIfExists\(\s*R2_TRACKER_RECON_KEY/.test(svc) && !/getObjectTextIfExists\([^)]*program-tracker/.test(svc)) {
    errors.push("service: does not read the tracker artifact from R2 (getObjectTextIfExists with the tracker key)");
  }
  if (!/program-tracker\/block-reconciliation-data\.json/.test(svc)) {
    errors.push("service: missing the R2 key program-tracker/block-reconciliation-data.json");
  }
  if (!/export async function computeProgramTrackerLive/.test(svc)) {
    errors.push("service: computeProgramTrackerLive (R2-first path) not exported");
  }
  if (!/await computeProgramTrackerLive\(/.test(route)) {
    errors.push("route: /program/tracker must await computeProgramTrackerLive (the R2-first path)");
  }
  if (!/reconcile:blocks/.test(wf)) {
    errors.push("workflow: program-board-sync.yml does not regenerate the artifact (reconcile:blocks)");
  }
  if (!/tracker:sync:r2/.test(wf)) {
    errors.push("workflow: program-board-sync.yml does not upload the tracker artifact (tracker:sync:r2)");
  }
  if (!uploadExists) {
    errors.push("scripts/sync-tracker-r2.mjs missing (the R2 upload)");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = {
    svc: 'const R2_TRACKER_RECON_KEY = "program-tracker/block-reconciliation-data.json";\nawait getObjectTextIfExists(R2_TRACKER_RECON_KEY)\nexport async function computeProgramTrackerLive(',
    route: "return reply.send(await computeProgramTrackerLive(new Date()));",
    wf: "run: npm run reconcile:blocks\nrun: npm run tracker:sync:r2",
    uploadExists: true,
  };
  const bad = { svc: 'readJson("docs/trackers/block-reconciliation-data.json")', route: "computeProgramTracker(new Date())", wf: "npm run board:sync:r2", uploadExists: false };
  if (assertAll(good).length !== 0) { console.error("SELFTEST FAIL: good flagged", assertAll(good)); process.exit(1); }
  if (assertAll(bad).length < 4) { console.error("SELFTEST FAIL: bad not caught", assertAll(bad)); process.exit(1); }
  console.log("verify-program-tracker-r2-live selftest OK");
  process.exit(0);
}

for (const p of [SVC, ROUTE, WF]) if (!fs.existsSync(p)) { console.error(`GUARD FAIL: missing ${p}`); process.exit(1); }
const errors = assertAll({
  svc: fs.readFileSync(SVC, "utf8"),
  route: fs.readFileSync(ROUTE, "utf8"),
  wf: fs.readFileSync(WF, "utf8"),
  uploadExists: fs.existsSync(UPLOAD),
});
if (errors.length) {
  console.error("GUARD FAIL — Program Tracker R2-live mechanism incomplete:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-program-tracker-r2-live OK — status sourced from R2 (CI-refreshed every merge) + committed fallback");
