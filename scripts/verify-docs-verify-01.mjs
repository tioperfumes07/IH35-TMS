#!/usr/bin/env node
/**
 * DOCS-VERIFY-01 — compose docs chrome/KPI/tenant guards (ECON/LINK density stay separate OPEN items).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LABEL = "verify-docs-verify-01";
const SELFTEST = process.argv.includes("--selftest");

const SIBLINGS = [
  "scripts/verify-docs-entity-column-entitylink.mjs",
  "scripts/verify-docs-s02-required-types-kpi.mjs",
  "scripts/verify-docs-home-kpi-clicks.mjs",
  "scripts/verify-docs-home-page-uses-paritytable.mjs",
  "scripts/verify-docs-tenant-scope.mjs",
];

function run(script) {
  const r = spawnSync(process.execPath, [join(ROOT, script)], { encoding: "utf8" });
  return { script, code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || "") };
}

export function verifyDocsVerify01() {
  const errs = [];
  const manifest = readFileSync(join(ROOT, "apps/frontend/src/routes/manifest.tsx"), "utf8");
  if (!/path="\/docs"/.test(manifest)) errs.push("manifest missing /docs");
  for (const s of SIBLINGS) {
    if (!existsSync(join(ROOT, s))) errs.push(`missing sibling ${s}`);
  }
  for (const s of SIBLINGS) {
    const r = run(s);
    if (r.code !== 0) errs.push(`${s} exited ${r.code}: ${r.out.slice(0, 200)}`);
  }
  return errs;
}

if (SELFTEST) {
  const errs = verifyDocsVerify01();
  if (errs.length) {
    console.error(`${LABEL} --selftest FAIL`, errs);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
} else {
  const errs = verifyDocsVerify01();
  if (errs.length) {
    console.error(`${LABEL} FAIL`);
    for (const e of errs) console.error(" -", e);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
