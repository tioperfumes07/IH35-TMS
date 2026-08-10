#!/usr/bin/env node
/**
 * FAIL-DQF-GATE — mdata/loads.routes.ts POST+PATCH must call assertDriverQualifiedForLoad when seating
 * or reassigning a driver (the last known gap in verify-load-write-paths-run-driver-qualification).
 *
 * Run: node scripts/verify-mdata-loads-driver-dqf-gate.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/mdata/loads.routes.ts";
const GATE = "assertDriverQualifiedForLoad";
const ERR = "DriverNotQualifiedError";
const LABEL = "verify-mdata-loads-driver-dqf-gate";

export function run(root = ROOT) {
  const errors = [];
  const abs = path.join(root, TARGET);
  if (!fs.existsSync(abs)) {
    errors.push(`missing ${TARGET}`);
    return errors;
  }
  const src = fs.readFileSync(abs, "utf8");

  if (!src.includes(GATE)) {
    errors.push(`${TARGET} must call ${GATE} on create/patch driver assignment`);
  }
  if (!src.includes(ERR)) {
    errors.push(`${TARGET} must map ${ERR} to HTTP 422`);
  }
  if (!src.includes("gateMdataLoadDriverAssignment")) {
    errors.push(`${TARGET} must centralize driver gating (gateMdataLoadDriverAssignment)`);
  }
  const postIdx = src.indexOf('app.post("/api/v1/mdata/loads"');
  const patchIdx = src.indexOf('app.patch("/api/v1/mdata/loads/:id"');
  const gateIdx = src.indexOf("gateMdataLoadDriverAssignment");
  if (postIdx === -1 || patchIdx === -1 || gateIdx === -1) {
    errors.push(`${TARGET}: expected POST + PATCH load routes and gate helper`);
  } else {
    const postBlock = src.slice(postIdx, patchIdx);
    if (!postBlock.includes("gateMdataLoadDriverAssignment")) {
      errors.push(`${TARGET}: POST /mdata/loads must gate driver on create`);
    }
    const patchBlock = src.slice(patchIdx, patchIdx + 8000);
    if (!patchBlock.includes("primaryChanged") || !patchBlock.includes("gateMdataLoadDriverAssignment")) {
      errors.push(`${TARGET}: PATCH /mdata/loads/:id must gate driver on reassignment`);
    }
  }
  const err422 = (src.match(/DriverNotQualifiedError/g) ?? []).length;
  if (err422 < 2) {
    errors.push(`${TARGET}: POST and PATCH catch blocks must map ${ERR} → 422 (found ${err422})`);
  }

  return errors;
}

function selftest() {
  const targetPath = path.join(ROOT, TARGET);
  const backup = fs.readFileSync(targetPath, "utf8");
  try {
    const broken = backup.replace(/gateMdataLoadDriverAssignment/g, "/* removed */");
    fs.writeFileSync(targetPath, broken, "utf8");
    const planted = run();
    if (!planted.length) throw new Error("planted gate removal not detected");
    console.log(`[${LABEL}] SELFTEST PASS (${planted.length} planted failures)`);
  } finally {
    fs.writeFileSync(targetPath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error(`\n[${LABEL}] FAILED:\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] All checks passed ✓`);
}

main();
