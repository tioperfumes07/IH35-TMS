#!/usr/bin/env node
/** LST-F125 — UnitDetail + FaultDrafts + EquipmentTransferRequests: no UUID-slice chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/units/UnitDetail.tsx",
  "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx",
  "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
];
const LABEL = "verify-unit-fault-xfer-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/id\.slice\(0,\s*8\)/.test(src) || /deepLinkUnitId\.slice\(0,\s*8\)/.test(src) || /driver_uuid\?\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: still UUID-slices`);
    }
    if (!/entityLabel\(/.test(src) && !/EntityLinkOrTombstone/.test(src)) {
      problems.push(`${file}: missing entityLabel`);
    }
  }
  const transfer = srcs[FILES[2]];
  if (!/import\s*\{\s*EntityLinkOrTombstone\s*\}\s*from\s*["'][^"']*\/EntityLinkOrTombstone["']/.test(transfer)) {
    problems.push(`${FILES[2]}: tombstone component must come from its canonical module`);
  }
  if (!/EntityLinkOrTombstone/.test(transfer)) {
    problems.push(`${FILES[2]}: unresolved drivers must render as non-clickable tombstones`);
  }
  if (!/id=\{row\.from_driver_uuid\}[\s\S]*?name=\{row\.from_driver_name\}[\s\S]*?noun="Driver"/.test(transfer)) {
    problems.push(`${FILES[2]}: from-driver must couple canonical id with its human name`);
  }
  if (!/id=\{row\.to_driver_uuid\}[\s\S]*?name=\{row\.to_driver_name\}[\s\S]*?noun="Driver"/.test(transfer)) {
    problems.push(`${FILES[2]}: to-driver must couple canonical id with its human name`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]].replace(
    /entityLabel\(unitQuery\.data\?\.unit_number,\s*id,\s*"Unit"\)/,
    "`Unit ${id.slice(0, 8)}`",
  );
  if (planted[FILES[0]] === srcs[FILES[0]] || !assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const badTransfer = { ...srcs, [FILES[2]]: srcs[FILES[2]].replace("EntityLinkOrTombstone", "EntityLink") };
  if (badTransfer[FILES[2]] === srcs[FILES[2]] || !assertAll(badTransfer).length) {
    console.error(`${LABEL} SELFTEST FAILED: unresolved-transfer planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
