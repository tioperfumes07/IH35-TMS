#!/usr/bin/env node
/**
 * FAIL-DQF-GATE — mdata/loads.routes.ts POST+PATCH must call assertDriverQualifiedForLoad when seating
 * or reassigning a driver (the last known gap in verify-load-write-paths-run-driver-qualification).
 *
 * Run: node scripts/verify-mdata-loads-driver-dqf-gate.mjs [--selftest]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/mdata/loads.routes.ts";
const GATE = "assertDriverQualifiedForLoad";
const ERR = "DriverNotQualifiedError";
const LABEL = "verify-mdata-loads-driver-dqf-gate";
// POST /mdata/loads moved onto the ONE shared create path in f3dd0719d0 ("loads.routes.ts +
// csv-seed-import.ts -- both fully onto the shared create path, ratchet closed at 0", #22372).
// createLoadWithFullSideEffects runs the same assertDriverQualifiedForLoad gate (plus the Owner
// override) and returns 422 E_DRIVER_NOT_QUALIFIED, which the route forwards. Same rule: POST must
// gate the driver — either through the local helper or through that shared writer, whose body is
// checked here too.
const SHARED = "apps/backend/src/dispatch/book-load.service.ts";
const SHARED_FN = "export async function createLoadWithFullSideEffects(";

function sharedCreateGates(root) {
  const abs = path.join(root, SHARED);
  if (!fs.existsSync(abs)) return false;
  const src = fs.readFileSync(abs, "utf8");
  const start = src.indexOf(SHARED_FN);
  if (start === -1) return false;
  const end = src.indexOf("\n}\n", start);
  const body = src.slice(start, end === -1 ? undefined : end);
  return body.includes(`await ${GATE}(`) && body.includes('"E_DRIVER_NOT_QUALIFIED"') && /status:\s*422/.test(body);
}

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
    const viaShared =
      postBlock.includes("createLoadWithFullSideEffects(") &&
      /reply\.code\(created\.status\)\.send\(created\.payload\)/.test(postBlock) &&
      sharedCreateGates(root);
    if (!postBlock.includes("gateMdataLoadDriverAssignment") && !viaShared) {
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
  const backup = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdata-loads-dqf-selftest-"));
  try {
    const tmpTarget = path.join(tmpRoot, TARGET);
    fs.mkdirSync(path.dirname(tmpTarget), { recursive: true });
    const broken = backup.replace(/gateMdataLoadDriverAssignment/g, "/* removed */");
    fs.writeFileSync(tmpTarget, broken, "utf8");
    const planted = run(tmpRoot);
    if (!planted.length) throw new Error("planted gate removal not detected");
    // Plant 2: routes intact, but the shared create writer loses its qualification gate → POST ungated.
    fs.writeFileSync(tmpTarget, backup, "utf8");
    const tmpShared = path.join(tmpRoot, SHARED);
    fs.mkdirSync(path.dirname(tmpShared), { recursive: true });
    const sharedSrc = fs.readFileSync(path.join(ROOT, SHARED), "utf8");
    fs.writeFileSync(tmpShared, sharedSrc.replace(new RegExp(`await ${GATE}\\(`, "g"), "await skipped("), "utf8");
    const planted2 = run(tmpRoot);
    if (!planted2.some((e) => e.includes("POST /mdata/loads must gate driver on create")))
      throw new Error("planted shared-writer gate removal not detected");
    console.log(`[${LABEL}] SELFTEST PASS (${planted.length} + ${planted2.length} planted failures)`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
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
