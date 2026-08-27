#!/usr/bin/env node
/**
 * DEADHEAD-REPORT-ESTIMATED-BRANCH-ALWAYS-RETURNS-ZERO-DEADHEAD
 *
 * resolveDeadheadToPickup()'s tier-3 ("estimated") branch used to return the exact same hardcoded
 * { miles: 0, method: "estimated" } whether the previous-delivery city genuinely differed from the
 * next-pickup city or was the same city — a load that truly deadheaded between two different
 * cities was structurally incapable of ever showing nonzero deadhead. This guard fails if the
 * differing-city branch stops calling a real distance estimate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/reports/deadhead.service.ts";
const LABEL = "verify-deadhead-estimated-branch-not-hardcoded-zero";

export function check(text) {
  const failures = [];
  const match = text.match(
    /if \(previousDeliveryCity && nextPickupCity && previousDeliveryCity !== nextPickupCity\) \{[\s\S]*?\n {2}\}/
  );
  if (!match) {
    failures.push(`${FILE}: the differing-city branch of resolveDeadheadToPickup was not found`);
    return failures;
  }
  const block = match[0];
  if (!/estimateCityPairMiles\(/.test(block)) {
    failures.push(`${FILE}: the differing-city branch no longer calls estimateCityPairMiles(...) — reverted to a hardcoded value`);
  }
  if (/return\s*\{\s*miles:\s*0,\s*method:\s*"estimated"\s*\}\s*;\s*$/.test(block.trim())) {
    failures.push(`${FILE}: the differing-city branch's only statement is the old hardcoded { miles: 0, method: "estimated" } — dead-branch regression`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const failures = check(text);
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — the differing-city tier-3 branch calls a real distance estimate, not a hardcoded 0`);
}

function selftest() {
  const good = `
  if (previousDeliveryCity && nextPickupCity && previousDeliveryCity !== nextPickupCity) {
    const estimatedMiles = estimateCityPairMiles(previousDeliveryCity, nextPickupCity);
    if (estimatedMiles != null) {
      return { miles: estimatedMiles, method: "estimated" };
    }
    return { miles: 0, method: "estimated" };
  }
  `;
  if (check(good).length) throw new Error(`PASS fail: ${JSON.stringify(check(good))}`);

  const regressed = `
  if (previousDeliveryCity && nextPickupCity && previousDeliveryCity !== nextPickupCity) {
    return { miles: 0, method: "estimated" };
  }
  `;
  if (!check(regressed).length) throw new Error("FAIL fail: reverted hardcoded-0 branch should have been caught");

  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
