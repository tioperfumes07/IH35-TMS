#!/usr/bin/env node
/**
 * FACT-DUAL-03 — factoring.routes must resolve the active factor through the canonical
 * factoring.factor / canonical_factor_agreements path, not by scanning mdata.vendors directly.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const FILE = "apps/backend/src/factoring/factoring.routes.ts";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  const failures = [];
  if (!exists(FILE)) {
    failures.push(`MISSING: ${FILE}`);
    return failures;
  }
  const src = read(FILE);

  if (!/resolveCanonicalActiveFactor/.test(src)) {
    failures.push(`${FILE}: must import/use resolveCanonicalActiveFactor for canonical active-factor resolution`);
  }

  if (!/factoring-balance-invoice-linkage\.service\.js/.test(src)) {
    failures.push(`${FILE}: resolveCanonicalActiveFactor must come from the canonical factoring-balance-invoice-linkage service`);
  }

  const resolveFn = src.match(/async function resolveActiveFactor[\s\S]*?(?=\nasync function|\nfunction|\nexport async function registerFactoringRoutes|$)/);
  if (resolveFn && /mdata\.vendors/.test(resolveFn[0])) {
    failures.push(`${FILE}: local resolveActiveFactor must not query mdata.vendors directly; it must delegate to resolveCanonicalActiveFactor`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, FILE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(realPath, backup.replace(/resolveCanonicalActiveFactor/g, "resolveOldVendorActiveFactor"), "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error("[verify-fact-dual-03-routes-resolve-canonical-factor] SELFTEST FAIL: planted rename did not fail");
        process.exit(1);
      }
      console.log(`[verify-fact-dual-03-routes-resolve-canonical-factor] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-fact-dual-03-routes-resolve-canonical-factor] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-fact-dual-03-routes-resolve-canonical-factor] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
