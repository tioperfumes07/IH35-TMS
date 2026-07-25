#!/usr/bin/env node
/**
 * GUARD (LST-F05): cancel/void/fmcsa routes must not resolve entity via UNION…ORDER BY id LIMIT 1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/backend/src/catalogs/load-cancellation-reasons.routes.ts",
  "apps/backend/src/catalogs/void-cancel-reasons.routes.ts",
  "apps/backend/src/catalogs/fmcsa.routes.ts",
];
const LABEL = "verify-no-lowest-uuid-entity-resolution";

function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

export function assertNoLowestUuid(sources) {
  const problems = [];
  for (const [rel, src] of Object.entries(sources)) {
    const c = code(src);
    if (/ORDER BY\s+id\s+LIMIT\s+1/i.test(c) || /ORDER BY\s+c\.id\s+LIMIT\s+1/i.test(c)) {
      problems.push(`${rel}: still resolves entity via ORDER BY id LIMIT 1 (LST-F05 hijack)`);
    }
    if (!/resolveOperatingCompanyId/.test(c)) {
      problems.push(`${rel}: must use resolveOperatingCompanyId (shared default-first resolver)`);
    }
    // fmcsa must import the shared helper, not redefine a local UNION resolver.
    if (rel.includes("fmcsa.routes") && /async function resolveOperatingCompanyId/.test(c)) {
      problems.push(`${rel}: must not redefine a local resolveOperatingCompanyId`);
    }
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const broken = {
    ...real,
    [FILES[2]]: real[FILES[2]] + "\nasync function resolveOperatingCompanyId(){ ORDER BY id LIMIT 1 }\n",
  };
  if (assertNoLowestUuid(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: lowest-UUID pattern not flagged`);
    process.exit(1);
  }
  const good = assertNoLowestUuid(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}
if (IS_MAIN) {
  const sources = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const problems = assertNoLowestUuid(sources);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — named routes use shared resolveOperatingCompanyId; no ORDER BY id LIMIT 1.`);
}
