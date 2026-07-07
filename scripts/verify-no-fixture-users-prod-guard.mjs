#!/usr/bin/env node
// USERS-1 CI guard: ensure no @example.com / probe-pattern email strings are hardcoded
// in backend source outside their designated allowlisted locations.
//
// Allowlisted files / patterns:
//   • identity/users.routes.ts        — FIXTURE_USER_EMAIL_RE guard definition (the fix itself)
//   • admin/admin-jobs.service.ts      — PROBE_EMAIL_RE deactivation handler
//   • onboarding/seed-sample-data.ts   — explicit sample-data seeds (not identity.users rows)
//   • dispatch/load-distribution.service.ts — dispatch@example.com fallback email domain (not an account)
//
// Any other backend TS file that hardcodes an @example.* / m2-probe / m2-stop / verifyfix
// string outside a regex literal or comment will fail CI.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const PROBE_PATTERN = /@example\.(com|org|net)|(m2-probe|m2-stop|verifyfix)/i;

// Files that are explicitly permitted to reference these patterns.
const ALLOWLIST = new Set([
  "apps/backend/src/identity/users.routes.ts",
  "apps/backend/src/admin/admin-jobs.service.ts",
  // archive-test-users: detects @example.com emails for filtering, not hardcoded accounts
  "apps/backend/src/identity/seed-cleanup/archive-test-users.routes.ts",
  "apps/backend/src/onboarding/seed-sample-data.ts",
  "apps/backend/src/dispatch/load-distribution.service.ts",
  // This script itself (the allowlist definition lives here)
  "scripts/verify-no-fixture-users-prod-guard.mjs",
]);

// Collect candidate files: non-test backend TS source.
let files;
try {
  files = execSync(
    'find apps/backend/src -name "*.ts" ! -name "*.test.ts" ! -name "*.spec.ts"',
    { encoding: "utf8" }
  )
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
} catch {
  console.error("[verify-no-fixture-users-prod-guard] find failed");
  process.exit(1);
}

const violations = [];

for (const absOrRel of files) {
  // Normalise to repo-root-relative path for allowlist lookup.
  const relPath = path.relative(process.cwd(), path.resolve(absOrRel));

  if (ALLOWLIST.has(relPath)) continue;

  let src;
  try {
    src = readFileSync(absOrRel, "utf8");
  } catch {
    continue;
  }

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip pure comment lines (// …) and regex-only lines.
    const stripped = line.trim();
    if (stripped.startsWith("//") || stripped.startsWith("*")) continue;

    // Check for probe-pattern strings in non-comment content.
    // Strip inline comments first so we don't flag code described in a comment.
    const codeOnly = line.replace(/\/\/.*$/, "");
    if (PROBE_PATTERN.test(codeOnly)) {
      violations.push({ file: relPath, line: i + 1, text: line.trim() });
    }
  }
}

if (violations.length === 0) {
  console.log("[verify-no-fixture-users-prod-guard] OK — no unexpected probe-pattern strings found.");
  process.exit(0);
}

console.error("[verify-no-fixture-users-prod-guard] FAIL — probe-pattern email strings found outside allowlist:");
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  →  ${v.text}`);
}
console.error(
  "\nProbe patterns (@example.com, m2-probe, m2-stop, verifyfix) must not be hardcoded in\n" +
  "backend source. Fixture accounts must stay out of production code paths.\n" +
  "To add a legitimate exception, extend the ALLOWLIST in scripts/verify-no-fixture-users-prod-guard.mjs."
);
process.exit(1);
