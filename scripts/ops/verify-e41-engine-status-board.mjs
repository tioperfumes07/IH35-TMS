#!/usr/bin/env node
/**
 * E-41 — Engine status board (Round 306). Ops lane; --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-e41-engine-status-board";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  catalog: "apps/backend/src/system/engine-status.catalog.ts",
  reads: "apps/backend/src/system/engine-status.reads.ts",
  routes: "apps/backend/src/system/engine-status.routes.ts",
  index: "apps/backend/src/index.ts",
  api: "apps/frontend/src/api/engine-status.ts",
  page: "apps/frontend/src/pages/system/EngineStatusBoardPage.tsx",
  system: "apps/frontend/src/pages/system/SystemModulePage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const catalog = read(FILES.catalog);
  for (const id of ["E-01", "E-10", "E-20", "E-40", "E-41", "E-44"]) {
    if (!catalog.includes(`id: "${id}"`)) f.push(`${FILES.catalog}: missing ${id}`);
  }
  if (!/ENGINE_STATUS_CATALOG/.test(catalog)) f.push(`${FILES.catalog}: missing catalog export`);

  const reads = read(FILES.reads);
  if (!/fetchEngineStatusBoard/.test(reads)) f.push(`${FILES.reads}: missing fetchEngineStatusBoard`);
  if (!/integration_sync_log/.test(reads)) f.push(`${FILES.reads}: must read integration_sync_log`);
  if (!/health === "red"|health: "red"/.test(reads)) f.push(`${FILES.reads}: must mark red producers`);

  const routes = read(FILES.routes);
  if (!/\/api\/v1\/system\/engine-status/.test(routes)) f.push(`${FILES.routes}: missing route path`);

  const index = read(FILES.index);
  if (!/registerEngineStatusRoutes/.test(index)) f.push(`${FILES.index}: must register engine-status routes`);

  const api = read(FILES.api);
  if (!/getEngineStatusBoard/.test(api)) f.push(`${FILES.api}: missing client`);

  const page = read(FILES.page);
  if (!/getEngineStatusBoard/.test(page)) f.push(`${FILES.page}: must call client`);
  if (!/data-testid="engine-status-board-page"/.test(page)) f.push(`${FILES.page}: missing page testid`);
  if (!/Rows 24 h|rows_written_24h/.test(page)) f.push(`${FILES.page}: must show rows 24h`);

  const system = read(FILES.system);
  if (!/\/system\/engine-status/.test(system)) f.push(`${FILES.system}: overview must link Engine status`);

  const manifest = read(FILES.manifest);
  if (!/path="\/system\/engine-status"/.test(manifest)) f.push(`${FILES.manifest}: missing route`);
  if (!/EngineStatusBoardPage/.test(manifest)) f.push(`${FILES.manifest}: must lazy-load page`);

  return f;
}

if (SELFTEST) {
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK`);
process.exit(0);
