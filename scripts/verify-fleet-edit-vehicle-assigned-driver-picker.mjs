#!/usr/bin/env node
/**
 * EditVehicleModal — assigned_driver_id must be EntityPicker kind="driver", not raw UUID text.
 * CLS-RAW-UUID-INPUT fleet slice · Cursor even claim: 2304.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-edit-vehicle-assigned-driver-picker";
const FILE = "apps/frontend/src/components/fleet/EditVehicleModal.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) {
    problems.push(`missing ${FILE}`);
    return problems;
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!/assigned_driver_id/.test(code)) {
    problems.push(`${FILE}: missing assigned_driver_id field`);
  }
  if (!/type:\s*"driver"/.test(code) || !/key:\s*"assigned_driver_id"[\s\S]{0,80}type:\s*"driver"/.test(code)) {
    problems.push(`${FILE}: assigned_driver_id must use type "driver" (EntityPicker), not text`);
  }
  if (!/EntityPicker/.test(code) || !/kind=["']driver["']/.test(code)) {
    problems.push(`${FILE}: assigned_driver_id must render EntityPicker kind="driver"`);
  }
  if (/Default Driver ID/.test(src)) {
    problems.push(`${FILE}: must not label assigned_driver_id as "Default Driver ID" (raw UUID chrome)`);
  }
  if (/assigned_driver_id[\s\S]{0,120}type:\s*"text"/.test(code)) {
    problems.push(`${FILE}: assigned_driver_id must not remain a raw text input`);
  }
  if (!/operatingCompanyId/.test(code)) {
    problems.push(`${FILE}: driver EntityPicker must pass operatingCompanyId for entity scope`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-edit-driver-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/fleet");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "EditVehicleModal.tsx"),
      `{ key: "assigned_driver_id", label: "Default Driver ID", type: "text", tab: "Quick-availability" }
<input id="assigned_driver_id" type="text" value={draft.assigned_driver_id} />`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — EditVehicleModal assigned_driver_id uses EntityPicker`);
}
