#!/usr/bin/env node
/**
 * GAP-PREMERGE-GATES-EXPAND Gate 2: TypeScript strict-null gate.
 *
 * Validates that:
 *   1. tsconfig.json has "strict": true (enables strictNullChecks, TS18048
 *      protection, and the full strict suite).
 *   2. "strictNullChecks" is NOT explicitly set to false (which would override
 *      the "strict" umbrella).
 *   3. No .ts source file under apps/backend/src uses a bare @ts-ignore
 *      comment without a required description (which would silently bypass
 *      TS18048 "Object is possibly undefined" errors).
 *
 * The first two checks are synchronous config reads; they are always run.
 * The @ts-ignore scan is a static source scan and does not require building.
 *
 * Note: The actual tsc --noEmit compilation is performed as a separate CI job
 * step (see .github/workflows/premerge-gates.yml) so full compiler errors are
 * visible in the job log.  This script is the config-level gate.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSCONFIG_PATH = path.join(ROOT, "tsconfig.json");
const SRC_DIR = path.join(ROOT, "apps", "backend", "src");

function fail(msg) {
  console.error(`verify:ts-strict-null FAIL: ${msg}`);
  process.exit(1);
}

function checkTsconfig() {
  if (!fs.existsSync(TSCONFIG_PATH)) {
    fail(`tsconfig.json not found at ${TSCONFIG_PATH}`);
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(TSCONFIG_PATH, "utf8"));
  } catch (e) {
    fail(`tsconfig.json is not valid JSON: ${e.message}`);
  }

  const co = cfg?.compilerOptions ?? {};

  if (co.strict !== true) {
    fail(
      `tsconfig.json compilerOptions.strict must be true (currently: ${JSON.stringify(co.strict)}). ` +
        `Set "strict": true to enable strictNullChecks and prevent TS18048 bypasses.`
    );
  }

  if (co.strictNullChecks === false) {
    fail(
      `tsconfig.json explicitly disables strictNullChecks. ` +
        `Remove "strictNullChecks": false — it overrides "strict": true and allows TS18048 errors through.`
    );
  }

  console.log("  tsconfig.json: strict=true, strictNullChecks not overridden ✓");
}

function walkTs(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walkTs(full, results);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

function scanForBareIgnores() {
  const files = walkTs(SRC_DIR);
  const violations = [];

  // @ts-ignore without a description is a code-smell bypass.
  // @ts-expect-error is acceptable (it fails if the error doesn't exist).
  // We flag bare `// @ts-ignore` with no trailing text.
  const bareIgnoreRe = /\/\/\s*@ts-ignore\s*$/m;

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (bareIgnoreRe.test(lines[i])) {
        violations.push(
          `  ${path.relative(ROOT, file)}:${i + 1}: bare @ts-ignore (no description) — add a reason or use @ts-expect-error`
        );
      }
    }
  }

  return violations;
}

async function main() {
  checkTsconfig();

  const ignoreViolations = scanForBareIgnores();
  if (ignoreViolations.length > 0) {
    console.error(
      "verify:ts-strict-null FAIL — bare @ts-ignore comments found (may silently bypass TS18048):\n"
    );
    for (const v of ignoreViolations) console.error(v);
    console.error(
      "\nFix: replace bare `// @ts-ignore` with `// @ts-ignore: <reason>` or switch to `// @ts-expect-error`."
    );
    process.exit(1);
  }

  console.log(
    `verify:ts-strict-null PASS — tsconfig strict=true, no bare @ts-ignore bypasses found`
  );
}

main().catch((err) => fail(String(err?.message ?? err)));
