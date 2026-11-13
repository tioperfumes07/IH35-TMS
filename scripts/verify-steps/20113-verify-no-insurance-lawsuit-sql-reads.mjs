#!/usr/bin/env node
/**
 * ENG-60 GUARD: no backend/frontend source file references insurance.lawsuit in SQL.
 * All reads moved to legal.matters type=lawsuit.
 * Verify-step 20113 (CC-1, mod-4 ≡ 1).
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEARCH_DIRS = ["apps/backend/src", "apps/frontend/src", "apps/driver-pwa/src"];
// Match actual SQL operations, not comments or historical mentions in strings.
const PATTERN = "(FROM|JOIN|INTO|UPDATE|TRUNCATE)\\s+insurance\\.lawsuit";

// Files that are allowed to reference the pattern (migration, this guard, historical docs)
const ALLOWED_PATHS = [
  "db/migrations/202616310100_eng60_drop_insurance_lawsuit.sql",
  "db/migrations/202611130000_insurance_claim_full_linkage.sql",
  "scripts/verify-steps/20113-verify-no-insurance-lawsuit-sql-reads.mjs",
];

let findings = [];

for (const dir of SEARCH_DIRS) {
  let output = "";
  try {
    output = execSync(
      `grep -rEn --include="*.ts" --include="*.tsx" -l "${PATTERN}" "${path.join(ROOT, dir)}" 2>/dev/null || true`,
      { cwd: ROOT, encoding: "utf8" }
    );
  } catch {
    // grep returns non-zero if no match — that's fine
  }
  const files = output.trim().split("\n").filter(Boolean);
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    if (ALLOWED_PATHS.some((a) => rel.includes(a))) continue;
    findings.push(rel);
  }
}

if (findings.length > 0) {
  console.error("FAIL: ENG-60 — the following files still reference insurance.lawsuit:");
  for (const f of findings) console.error(`  ${f}`);
  console.error("All reads must use legal.matters WHERE type = 'lawsuit'.");
  process.exit(1);
}

console.log("PASS: 20113-verify-no-insurance-lawsuit-sql-reads — no source references to insurance.lawsuit");
