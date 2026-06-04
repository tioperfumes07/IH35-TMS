#!/usr/bin/env node
/**
 * INFRA-3: DriverStop field parity — shared-types uses `type`; consumers must not use `stop_type`.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const sharedTypesLoads = path.join(ROOT, "packages/shared-types/src/loads.ts");
const driverPwaSrc = path.join(ROOT, "apps/driver-pwa/src");
const stopAction = path.join(driverPwaSrc, "pages/StopAction.tsx");
const stopActionTest = path.join(driverPwaSrc, "pages/__tests__/StopAction.test.ts");
const archDesign = path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md");

function fail(message) {
  console.error(`verify:shared-types-consumer-parity FAILED\n- ${message}`);
  process.exit(1);
}

function readOrFail(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`missing ${label}: ${path.relative(ROOT, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function walkTsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const loadsSrc = readOrFail(sharedTypesLoads, "shared-types loads");
const stopActionSrc = readOrFail(stopAction, "StopAction page");
readOrFail(stopActionTest, "StopAction vitest");

if (!loadsSrc.includes("export type DriverStop")) {
  fail("packages/shared-types/src/loads.ts must export DriverStop");
}
if (!loadsSrc.match(/DriverStop[\s\S]*?\btype:\s*StopType/)) {
  fail("DriverStop must declare `type: StopType` in shared-types");
}
if (loadsSrc.match(/DriverStop[\s\S]*?stop_type/)) {
  fail("DriverStop must not use stop_type in shared-types");
}

const pwaFiles = walkTsFiles(driverPwaSrc);
const stopTypeHits = [];
for (const file of pwaFiles) {
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("stop_type")) {
    stopTypeHits.push(path.relative(ROOT, file));
  }
}
if (stopTypeHits.length) {
  fail(`driver-pwa must not reference stop_type (DriverStop uses type): ${stopTypeHits.join(", ")}`);
}

const requiredStopActionFragments = [
  'resolvedStop.type === "delivery"',
  'resolvedStop.type !== "delivery"',
];
for (const fragment of requiredStopActionFragments) {
  if (!stopActionSrc.includes(fragment)) {
    fail(`StopAction.tsx missing required fragment: ${fragment}`);
  }
}

const arch = readOrFail(archDesign, "ARCHITECTURAL_DESIGN");
if (!arch.includes("verify:shared-types-consumer-parity")) {
  fail("ARCHITECTURAL_DESIGN must reference verify:shared-types-consumer-parity");
}
if (!arch.includes("INFRA-3")) {
  fail("ARCHITECTURAL_DESIGN must document INFRA-3");
}

console.log("verify:shared-types-consumer-parity OK");
