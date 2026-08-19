#!/usr/bin/env node
/** Exact dispatch POD-review load/driver identity-honesty ratchet. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/PodReviewPage.tsx";

function audit(source) {
  const failures = [];
  if (!/import\s*\{\s*EntityLinkOrTombstone\s*\}\s*from\s*["'][^"']*\/EntityLinkOrTombstone["']/.test(source)) failures.push("must import the canonical tombstone component");
  if (!/kind="load" id=\{doc\.load_id\} name=\{doc\.load_number\} noun="Load"/.test(source)) failures.push("load id must be coupled to its human load number");
  if (!/kind="driver" id=\{doc\.driver_id\} name=\{doc\.driver_name\} noun="Driver"/.test(source)) failures.push("driver id must be coupled to its human name");
  if (/entityLabel\(doc\.(?:load_number|driver_name),\s*doc\.(?:load_id|driver_id)/.test(source)) failures.push("must not mount unresolved fallback labels as links");
  return failures;
}

const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    [/name=\{doc\.load_number\}/, "name={doc.load_id}"],
    [/name=\{doc\.driver_name\}/, "name={doc.driver_id}"],
    [/EntityLinkOrTombstone/, "EntityLink"],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = source.replace(pattern, replacement);
    if (broken === source || audit(broken).length === 0) throw new Error(`selftest mutation escaped: ${pattern}`);
  }
  if (audit(source).length) throw new Error(`live source failed: ${audit(source).join(" | ")}`);
  console.log(`verify-pod-review-entity-tombstones PASS — selftest ${mutations.length}/3`);
} else {
  const failures = audit(source);
  if (failures.length) throw new Error(`verify-pod-review-entity-tombstones FAIL: ${failures.join(" | ")}`);
  console.log("verify-pod-review-entity-tombstones PASS");
}
