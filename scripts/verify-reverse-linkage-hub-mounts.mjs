#!/usr/bin/env node
/**
 * verify-reverse-linkage-hub-mounts.mjs — CLS-REVERSE-LINKAGE-MISSING (class wave)
 *
 * Ratcheting guard: every hub in scripts/lib/reverse-linkage-registry.mjs must mount the
 * listed reverse-linkage sections/components. Fails if any registry marker is absent from
 * the hub file.
 *
 *   node scripts/verify-reverse-linkage-hub-mounts.mjs
 *   node scripts/verify-reverse-linkage-hub-mounts.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REVERSE_LINKAGE_HUB_MOUNTS } from "./lib/reverse-linkage-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reverse-linkage-hub-mounts";

function readHub(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * @param {typeof REVERSE_LINKAGE_HUB_MOUNTS} registry
 * @param {(rel: string) => string} readFile
 */
export function checkRegistry(registry, readFile) {
  const failures = [];
  for (const entry of registry) {
    let src;
    try {
      src = readFile(entry.hub);
    } catch {
      failures.push(`${entry.label}: hub file missing — ${entry.hub}`);
      continue;
    }
    for (const req of entry.required) {
      if (!src.includes(req.marker)) {
        failures.push(`${entry.label} (${entry.hub}): missing ${req.label} — expected marker \`${req.marker}\``);
      }
    }
  }
  return failures;
}

function check() {
  return checkRegistry(REVERSE_LINKAGE_HUB_MOUNTS, readHub);
}

if (process.argv.includes("--selftest")) {
  const liveFailures = check();
  if (liveFailures.length) {
    console.error(`${LABEL} --selftest FAIL: live tree missing mounts`);
    for (const f of liveFailures) console.error(`  - ${f}`);
    process.exit(1);
  }

  const sample = REVERSE_LINKAGE_HUB_MOUNTS[0];
  const good = readHub(sample.hub);
  if (checkRegistry([sample], () => good).length) {
    console.error(`${LABEL} --selftest FAIL: positive control unexpectedly red`);
    process.exit(1);
  }

  const stripped = good.replaceAll("DriverSafetyReverseSection", "");
  const negative = checkRegistry([sample], () => stripped);
  if (negative.length === 0) {
    console.error(`${LABEL} --selftest FAIL: negative control did not fail when marker removed`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = check();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS (${REVERSE_LINKAGE_HUB_MOUNTS.length} hubs)`);
