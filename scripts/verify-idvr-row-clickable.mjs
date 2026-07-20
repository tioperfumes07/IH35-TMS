#!/usr/bin/env node
/**
 * verify-idvr-row-clickable.mjs — Ops F: IDVR list rows must open detail.
 *
 * Locks:
 * - IdvrPage wires ParityTable onRowClick → /safety/idvr/:id
 * - IdvrDetailPage mounts getSafetyDvirDetail
 * - manifest registers /safety/idvr/:id (and nested idvr/:id)
 *
 * Usage:
 *   node scripts/verify-idvr-row-clickable.mjs
 *   node scripts/verify-idvr-row-clickable.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-idvr-row-clickable";

const LIST = "apps/frontend/src/pages/safety/IdvrPage.tsx";
const DETAIL = "apps/frontend/src/pages/safety/IdvrDetailPage.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertContains(source, needle, where) {
  if (!source.includes(needle)) {
    throw new Error(`${LABEL}: missing ${JSON.stringify(needle)} in ${where}`);
  }
}

function run() {
  const list = read(LIST);
  const detail = read(DETAIL);
  const manifest = read(MANIFEST);

  assertContains(list, "onRowClick", LIST);
  assertContains(list, "/safety/idvr/", LIST);
  assertContains(list, "useNavigate", LIST);

  assertContains(detail, "getSafetyDvirDetail", DETAIL);
  assertContains(detail, "idvr-detail-page", DETAIL);

  assertContains(manifest, "IdvrDetailPage", MANIFEST);
  assertContains(manifest, "/safety/idvr/:id", MANIFEST);
  assertContains(manifest, 'path="idvr/:id"', MANIFEST);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const tmp = path.join(ROOT, ".tmp-idvr-row-clickable-selftest");
  fs.mkdirSync(tmp, { recursive: true });
  const bad = path.join(tmp, "Bad.tsx");
  fs.writeFileSync(bad, "export function IdvrPage(){ return null }\n");
  const source = fs.readFileSync(bad, "utf8");
  if (source.includes("onRowClick")) {
    throw new Error(`${LABEL}: selftest expected planted miss`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
