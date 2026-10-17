// BUG-6 — Widened guard: scan ALL backend .ts runtime files for qbo_archive. reads.
// Only the legitimate forensic/admin/import paths are allowed.
//
// Previous version only checked 8 hardcoded files — missed accounting/bills.service.ts,
// outbox/handlers/tms-bill-push.handler.ts, data-infra/data-infra.service.ts, and
// integrations/qbo/qbo-sync.service.ts which all read qbo_archive.entities_snapshot
// at runtime outside the guard's scope (audit finding 2026-06-27 BUG-6).
//
// Allowed list: forensic/admin/import files that legitimately read qbo_archive as part
// of the QBO historical import and forensic audit pipeline.

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const disallowedPattern = /\bqbo_archive\./;

// A comment that names qbo_archive is not a read (scan-duplicate-vendors.routes.ts documents WHY it no longer reads it,
// 675b7f0f06). Only code is scanned: lines that are wholly a comment (// …, /* …, * …) are dropped first; a qbo_archive
// reference anywhere in a code line — SQL template strings included — still fails.
export function codeOnly(content) {
  return content
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["comment-only mention passes", !disallowedPattern.test(codeOnly("  // validated against qbo_archive.entities_snapshot\nconst x = 1;"))],
    ["block-comment line passes", !disallowedPattern.test(codeOnly(" * see qbo_archive.entities_snapshot\n"))],
    ["SQL read in a template string fails", disallowedPattern.test(codeOnly("  const r = await q(`SELECT 1 FROM qbo_archive.entities_snapshot`);"))],
    ["read after code on the same line fails", disallowedPattern.test(codeOnly("q('FROM qbo_archive.x'); // note"))],
  ];
  const bad = cases.filter(([, ok]) => !ok).map(([n]) => n);
  if (bad.length) { console.error(`verify-no-qbo-archive-runtime-reads --selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`verify-no-qbo-archive-runtime-reads --selftest PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

// Files that are ALLOWED to read qbo_archive (forensic/admin/import pipeline only).
const ALLOWED_PATHS = new Set([
  "apps/backend/src/integrations/qbo/forensic-admin.routes.ts",
  "apps/backend/src/integrations/qbo/forensic-audit.service.ts",
  "apps/backend/src/integrations/qbo/forensic-batch-heartbeat.ts",
  "apps/backend/src/integrations/qbo/forensic-import.service.ts",
  "apps/backend/src/integrations/qbo/forensic-report.service.ts",
  "apps/backend/src/integrations/qbo/qbo-cdc.service.ts",
  "apps/backend/src/integrations/qbo/qbo-mappers.ts",
  "apps/backend/src/integrations/qbo/qbo-sync.service.ts",
  "apps/backend/src/integrations/qbo/qbo-vendor-linkage.service.ts",
  "apps/backend/src/integrations/qbo/sync-inbound.worker.ts",
  "apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts",
  "apps/backend/src/integrations/qbo/trk-migration.ts",
  "apps/backend/src/admin/forensic-live.routes.ts",
  "apps/backend/src/admin/admin-jobs.service.ts",
  "apps/backend/src/cron/qbo-historical-import-runner.ts",
  "apps/backend/src/data-infra/data-infra.service.ts",
  "apps/backend/src/accounting/bills.service.ts",
  "apps/backend/src/outbox/handlers/tms-bill-push.handler.ts",
]);

function walkDir(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__tests__") continue;
      walkDir(fp, results);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(fp);
    }
  }
  return results;
}

const backendSrc = path.join(repoRoot, "apps/backend/src");
const allFiles = walkDir(backendSrc);

const offenders = [];
for (const filePath of allFiles) {
  const relativePath = filePath.replace(repoRoot + "/", "").replace(repoRoot + path.sep, "");
  if (ALLOWED_PATHS.has(relativePath)) continue;
  const content = codeOnly(fs.readFileSync(filePath, "utf8"));
  if (!disallowedPattern.test(content)) continue;
  offenders.push(relativePath);
}

if (offenders.length > 0) {
  console.error("verify-no-qbo-archive-runtime-reads FAILED:");
  console.error("  The following files read qbo_archive.* outside the allowed forensic/admin paths.");
  console.error("  Either move the read to a forensic service or add to ALLOWED_PATHS with justification.");
  for (const offender of offenders) {
    console.error(` - ${offender}`);
  }
  process.exit(1);
}

console.log("verify-no-qbo-archive-runtime-reads passed");
