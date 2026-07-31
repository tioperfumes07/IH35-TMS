#!/usr/bin/env node
/**
 * SAF-F27 — no relative + absolute twin under the /safety layout.
 *
 * React Router first-match means `<Route path="driver-files" />` and
 * `<Route path="/safety/driver-files" />` as siblings under `path="/safety"`
 * register the SAME URL twice; the second is dead. Absolute-only children
 * (e.g. `/safety/reports`) are fine — they have no relative twin.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MANIFEST = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");

export function extractSafetyChildrenBlock(source) {
  const start = source.indexOf('path="/safety"');
  if (start < 0) return "";
  const end = source.indexOf('path="/liabilities"', start);
  if (end < 0) return source.slice(start);
  return source.slice(start, end);
}

export function findSafetyRelAbsTwins(source) {
  const block = extractSafetyChildrenBlock(source);
  const rels = new Set([...block.matchAll(/path="([^"/][^"]*)"/g)].map((m) => m[1]));
  const problems = [];
  for (const m of block.matchAll(/path="(\/safety\/[^"]*)"/g)) {
    const abs = m[1];
    const rel = abs.slice("/safety/".length);
    if (rels.has(rel)) {
      problems.push(
        `SAF-F27 twin: path="${rel}" and path="${abs}" both resolve to ${abs} — keep the relative child only`
      );
    }
  }
  return problems;
}

function selftest() {
  const dirty = `
    path="/safety"
    <Route path="driver-files" />
    <Route path="/safety/driver-files" />
    path="/liabilities"
  `;
  if (!findSafetyRelAbsTwins(dirty).some((p) => p.includes("driver-files"))) {
    throw new Error("SELFTEST FAILED: planted relative/absolute twin was not caught");
  }
  const clean = `
    path="/safety"
    <Route path="driver-files" />
    <Route path="/safety/reports" />
    path="/liabilities"
  `;
  if (findSafetyRelAbsTwins(clean).length) {
    throw new Error("SELFTEST FAILED: absolute-only child was falsely flagged");
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--selftest")) {
    selftest();
    console.log("verify-saf-f27-no-safety-rel-abs-twins --selftest OK");
    return;
  }
  const source = fs.readFileSync(MANIFEST, "utf8");
  const problems = findSafetyRelAbsTwins(source);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    throw new Error(`verify-saf-f27-no-safety-rel-abs-twins FAIL — ${problems.length} twin(s)`);
  }
  console.log("verify-saf-f27-no-safety-rel-abs-twins OK — no /safety relative+absolute twins");
}

main();
