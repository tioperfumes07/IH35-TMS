#!/usr/bin/env node
/**
 * SAF-F27 — Safety routes under SafetyLayout must use relative path= only.
 *
 * Defect class: dual absolute+relative registration under path="/safety".
 * React Router first-match leaves the second twin dead; a mixed block (some
 * absolute /safety/* siblings + some relative) is DRIFT even when twins=0.
 *
 * Canonical pattern (matches Portal, nested modules): relative children under
 * the layout parent. Live URLs stay /safety/<leaf> — only manifest path= changes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MANIFEST = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const LABEL = "verify-safety-route-registration";

/** Routes that must stay registered (relative leaf under /safety). */
const REQUIRED_RELATIVE_LEAVES = [
  "driver-files",
  "idvr",
  "idvr/:id",
  "safety-events",
  "trailer-interchanges",
  "permits",
  "integrity-reports",
  "training/programs",
  "training/records",
  "reports",
  "audit-425c",
];

export function extractSafetyChildrenBlock(source) {
  const start = source.indexOf('path="/safety"');
  if (start < 0) return "";
  const end = source.indexOf('path="/liabilities"', start);
  if (end < 0) return source.slice(start);
  return source.slice(start, end);
}

export function findSafetyRouteRegistrationProblems(source) {
  const block = extractSafetyChildrenBlock(source);
  const problems = [];

  if (!source.includes('path="/safety"') || !source.includes("<SafetyLayout")) {
    problems.push("manifest must mount SafetyLayout at path=\"/safety\"");
  }

  const absoluteChildren = [...block.matchAll(/path="(\/safety\/[^"]*)"/g)].map((m) => m[1]);
  for (const abs of absoluteChildren) {
    problems.push(
      `SAF-F27 drift: absolute child path="${abs}" under SafetyLayout — use relative "${abs.slice("/safety/".length)}" instead`
    );
  }

  const rels = new Set([...block.matchAll(/path="([^"/][^"]*)"/g)].map((m) => m[1]));
  for (const abs of absoluteChildren) {
    const rel = abs.slice("/safety/".length);
    if (rels.has(rel)) {
      problems.push(
        `SAF-F27 twin: path="${rel}" and path="${abs}" both resolve to ${abs} — keep relative only`
      );
    }
  }

  for (const leaf of REQUIRED_RELATIVE_LEAVES) {
    const hasRel = block.includes(`path="${leaf}"`) || block.includes(`path='${leaf}'`);
    if (!hasRel) {
      problems.push(`manifest missing relative Safety route path="${leaf}" under /safety`);
    }
  }

  return problems;
}

function selftest() {
  const dirtyMixed = `
    path="/safety"
    <Route path="home" />
    <Route path="/safety/driver-files" />
    path="/liabilities"
  `;
  if (!findSafetyRouteRegistrationProblems(dirtyMixed).some((p) => p.includes("absolute child"))) {
    throw new Error("SELFTEST FAILED: planted absolute child was not caught");
  }

  const dirtyTwin = `
    path="/safety"
    <Route path="permits" />
    <Route path="/safety/permits" />
    path="/liabilities"
  `;
  if (!findSafetyRouteRegistrationProblems(dirtyTwin).some((p) => p.includes("twin"))) {
    throw new Error("SELFTEST FAILED: planted relative+absolute twin was not caught");
  }

  const clean = `
    path="/safety"
    <SafetyLayout />
    <Route path="driver-files" />
    <Route path="idvr" />
    <Route path="idvr/:id" />
    <Route path="safety-events" />
    <Route path="trailer-interchanges" />
    <Route path="permits" />
    <Route path="integrity-reports" />
    <Route path="training/programs" />
    <Route path="training/records" />
    <Route path="reports" />
    <Route path="audit-425c" />
    path="/liabilities"
  `;
  if (findSafetyRouteRegistrationProblems(clean).length) {
    throw new Error(`SELFTEST FAILED: clean relative block falsely flagged: ${findSafetyRouteRegistrationProblems(clean).join("; ")}`);
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--selftest")) {
    selftest();
    console.log(`${LABEL} --selftest OK`);
    return;
  }

  const source = fs.readFileSync(MANIFEST, "utf8");
  const problems = findSafetyRouteRegistrationProblems(source);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    throw new Error(`${LABEL} FAIL — ${problems.length} problem(s)`);
  }
  console.log(`${LABEL} OK — SafetyLayout uses relative child routes only (no /safety/* path= drift)`);
}

main();
