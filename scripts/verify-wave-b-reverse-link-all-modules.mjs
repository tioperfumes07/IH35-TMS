#!/usr/bin/env node
/** Full-product reverse-link column: route reachability + canonical FK/label/panel ratchets. */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { auditConnectivity, collectRequiredConnectivity } from "./verify-wave-b-connectivity-all-modules.mjs";

const COMPOSED = [
  "verify-entitylink-deep-links.mjs",
  "verify-linkage-required-edges.mjs",
  "verify-reverse-linkage-embedded.mjs",
  "verify-reverse-linkage-hub-mounts.mjs",
  "verify-entity-label-rejects-uuid-shaped-name.mjs",
  "verify-banking-by-linkage-reverse.mjs",
  "verify-asset-safety-reverse-section.mjs",
  "verify-driver-safety-reverse-section.mjs",
  "verify-customer-reverse-link-wired.mjs",
  "verify-accounting-vendor-reverse-link-wired.mjs",
  "verify-trailer-profile-sections-complete.mjs",
  "verify-task-link-contract.mjs",
  "verify-legal-reverse-drill-fleet-insurance.mjs",
  "verify-wave-b-reverse-link-column.mjs",
];

const moduleSpecs = fs.readdirSync("docs/specs/scoreboard/modules").filter((file) => file.endsWith(".required.json"));
const reverseLeaves = [];
for (const file of moduleSpecs) {
  const spec = JSON.parse(fs.readFileSync(`docs/specs/scoreboard/modules/${file}`, "utf8"));
  for (const leaf of spec.leaves || []) {
    if ((leaf.required || []).includes("reverse_link")) reverseLeaves.push({ module: spec.module, id: leaf.id, route: leaf.route_hint });
  }
}

const routeSources = [
  "apps/frontend/src/routes/manifest.tsx",
  "apps/frontend/src/routes/collections.routes.ts",
  "apps/frontend/src/router/route-manifest.ts",
].map((file) => fs.readFileSync(file, "utf8")).join("\n");

if (process.argv.includes("--selftest")) {
  const target = reverseLeaves.find((leaf) => leaf.module === "users" && leaf.route === "/users");
  const mutated = routeSources.replace('path="/users"', 'path="/users-removed"');
  const failures = auditConnectivity(mutated, [...reverseLeaves, ...collectRequiredConnectivity()]);
  if (!target || !failures.some((failure) => failure.startsWith(`users:${target.id}:`))) {
    console.error("verify-wave-b-reverse-link-all-modules SELFTEST FAIL — removed reverse route was not detected");
    process.exit(1);
  }
  console.log("verify-wave-b-reverse-link-all-modules SELFTEST PASS — removed reverse route detected");
  process.exit(0);
}

const failures = auditConnectivity(routeSources, [...reverseLeaves, ...collectRequiredConnectivity()]);
for (const guard of COMPOSED) {
  const result = spawnSync(process.execPath, [`scripts/${guard}`], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${guard} failed:\n${result.stdout}${result.stderr}`);
}
// LINK-F5171 (2026-08-14): honest per-leaf sweep dropped 123 false-blanket reverse_link Required
// markings (376 -> 252, real gaps stay Required). Floor corrected to match — same class of fix as
// LINK-F5168's driver-column floor correction. Never raise this back toward 300 to "cover" a future
// re-inflation; recount honestly instead.
if (reverseLeaves.length < 240) failures.push(`reverse-link inventory unexpectedly shrank to ${reverseLeaves.length}`);
if (failures.length) {
  console.error(`verify-wave-b-reverse-link-all-modules FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`verify-wave-b-reverse-link-all-modules PASS — ${reverseLeaves.length} reverse-link leaves + 14 canonical guards`);
