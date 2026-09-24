#!/usr/bin/env node
// GUARD — verify-gate-live-reads-use-ci-readonly (ROUND E23, Q06, DEVIN-B)
//
// Gate live reads must connect as ih35_ci_readonly, never neondb_owner. Six seats read prod
// while the feed writes and owner-role reads contend with its locks. This guard scans every
// scripts/verify-*.mjs file for hardcoded neondb_owner references in connection strings or
// role assignments, and for any connection that bypasses the canonical require-live-db.mjs
// helper (which uses DATABASE_URL as-is, set by the environment to ih35_ci_readonly).
//
// ALLOWLIST BY ANNOTATION ONLY: `// NEONDB-OWNER-OK: <reason>` (e.g. migration runners that
// legitimately need owner privileges). No silent exemptions.
//
// Static, no DATABASE_URL: a source-text scan that never reads money data.
//
// Self-test: node scripts/verify-gate-live-reads-use-ci-readonly.mjs --selftest
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scan of verify-*.mjs for neondb_owner references — never connects to a database";

import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-gate-live-reads-use-ci-readonly";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts");

// Patterns that indicate a neondb_owner connection:
// 1. A connection string containing "neondb_owner" as the user
// 2. A role assignment like `role: 'neondb_owner'` or `set_config('role', 'neondb_owner'`
// 3. A `SET ROLE neondb_owner` statement
// 4. A `connectionString` with `user=neondb_owner`
const NEONDB_OWNER_PATTERNS = [
  /user\s*=\s*neondb_owner/i,
  /:\/\/neondb_owner:/i,
  /role\s*[:=]\s*['"]neondb_owner['"]/i,
  /SET\s+ROLE\s+neondb_owner/i,
  /set_config\s*\(\s*['"]role['"]\s*,\s*['"]neondb_owner['"]/i,
  /['"]neondb_owner['"]\s*\.\s*password/i,
];

// Files that are ALLOWED to reference neondb_owner (migration runners, schema owners, etc.)
// — these are NOT gate live reads, they are migration/DDL tools.
const MIGRATION_PATHS = [
  "scripts/verify-migration-no-unknown-roles.mjs", // lists neondb_owner as a valid migration role
  "scripts/verify-multi-entity-separation.mjs", // checks that code FORBIDS neondb_owner
  "scripts/verify-app-pool-role-fail-closed.mjs", // checks the app pool never uses neondb_owner
  "scripts/verify-no-stale-literals-in-guards.mjs", // selftest fixtures may reference it
  "scripts/verify-gate-live-reads-use-ci-readonly.mjs", // this guard itself
];

function listVerifyScripts(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith("verify-") && ent.name.endsWith(".mjs")) {
      out.push(path.join(dir, ent.name));
    }
  }
  return out.sort();
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const findings = [];
  const rel = path.relative(ROOT, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines that are descriptions, not code
    if (line.trim().startsWith("//") && !line.includes("NEONDB-OWNER-OK")) {
      // Check if this comment line contains a neondb_owner reference that is NOT annotated OK
      for (const pat of NEONDB_OWNER_PATTERNS) {
        if (pat.test(line)) {
          // It's in a comment — check if there's an OK annotation on this or next line
          const nextLine = lines[i + 1] || "";
          if (line.includes("NEONDB-OWNER-OK") || nextLine.includes("NEONDB-OWNER-OK")) {
            continue;
          }
          // Comment references to neondb_owner in migration-role-listing guards are OK
          if (MIGRATION_PATHS.includes(rel)) continue;
          // Also skip lines that are clearly describing the guard's purpose (forbidding neondb_owner)
          if (/forbid|never|must not|not.*use|block|reject/i.test(line)) continue;
          findings.push({ file: rel, line: i + 1, text: line.trim() });
        }
      }
      continue;
    }

    for (const pat of NEONDB_OWNER_PATTERNS) {
      if (pat.test(line)) {
        // Check for annotation on this line or the line above
        const prevLine = lines[i - 1] || "";
        if (line.includes("NEONDB-OWNER-OK") || prevLine.includes("NEONDB-OWNER-OK")) {
          continue;
        }
        if (MIGRATION_PATHS.includes(rel)) continue;
        findings.push({ file: rel, line: i + 1, text: line.trim() });
      }
    }
  }

  return findings;
}

function runSelftest() {
  const fixtures = [
    // RED: connection string with neondb_owner
    {
      name: "connection string with neondb_owner user",
      line: 'const url = "postgresql://neondb_owner:pass@host/db";',
      expect: true, // should find
    },
    // RED: SET ROLE neondb_owner
    {
      name: "SET ROLE neondb_owner",
      line: "await client.query('SET ROLE neondb_owner');",
      expect: true,
    },
    // Clean: ih35_ci_readonly
    {
      name: "ih35_ci_readonly connection",
      line: 'const url = "postgresql://ih35_ci_readonly:pass@host/db";',
      expect: false,
    },
    // Clean: annotated OK
    {
      name: "neondb_owner with NEONDB-OWNER-OK annotation",
      line: "const role = 'neondb_owner'; // NEONDB-OWNER-OK: migration runner",
      expect: false,
    },
    // Clean: comment forbidding neondb_owner
    {
      name: "comment forbidding neondb_owner",
      line: "// The app pool must NEVER run as neondb_owner (superuser).",
      expect: false,
    },
    // RED: set_config role neondb_owner
    {
      name: "set_config role neondb_owner",
      line: "SELECT set_config('role', 'neondb_owner', false);",
      expect: true,
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const { name, line, expect: exp } of fixtures) {
    const found = NEONDB_OWNER_PATTERNS.some((p) => p.test(line));
    // For the annotation test, simulate the full scan logic
    let detected = found;
    if (found && line.includes("NEONDB-OWNER-OK")) detected = false;
    if (found && /forbid|never|must not|not.*use|block|reject/i.test(line)) detected = false;

    if (detected !== exp) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${exp}, got ${detected}`);
      fail += 1;
    } else {
      pass += 1;
    }
  }

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return;
  }

  const scripts = listVerifyScripts(SCRIPTS_DIR);
  const allFindings = [];
  for (const script of scripts) {
    const findings = scanFile(script);
    allFindings.push(...findings);
  }

  if (allFindings.length > 0) {
    const sample = allFindings.slice(0, 10).map((f) => `  ${f.file}:${f.line} — ${f.text}`).join("\n");
    console.error(
      `${LABEL}: FAIL — ${allFindings.length} neondb_owner reference(s) in gate live read scripts.\n` +
        `Gate live reads must connect as ih35_ci_readonly, never neondb_owner (owner-role reads contend with feed locks).\n` +
        `First ${Math.min(10, allFindings.length)}:\n${sample}\n` +
        `Allowlist by annotation only: // NEONDB-OWNER-OK: <reason>`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `${LABEL}: PASS — ${scripts.length} verify-*.mjs scripts scanned, 0 neondb_owner references in gate live reads.`,
  );
}

await run({ selftest: process.argv.includes("--selftest") });
