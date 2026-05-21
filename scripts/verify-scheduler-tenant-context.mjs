#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "..");
const ROOT = process.env.VERIFY_SCHEDULER_TENANT_CONTEXT_ROOT
  ? path.resolve(process.env.VERIFY_SCHEDULER_TENANT_CONTEXT_ROOT)
  : DEFAULT_ROOT;
const SRC_ROOT = path.join(ROOT, "apps", "backend", "src");

const TENANT_AGNOSTIC_MARKER = "@cron-tenant-agnostic";
const TENANT_CONTEXT_RE = /\boperating_company_id\b|\boperatingCompanyId\b/;
const GUARD_IMPORT_RE = /from\s+["'][^"']*tenant-context-guard(?:\.js)?["']/;
const GUARD_LOCAL_DEF_RE = /\bfunction\s+assertTenantContext\s*\(|\bconst\s+assertTenantContext\s*=/;
const GUARD_CALL_RE = /\bassertTenantContext\s*\(/;

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolute, out);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    out.push(absolute);
  }
  return out;
}

function isCronEntryPoint(relPathUnix) {
  if (relPathUnix.startsWith("apps/backend/src/cron/")) return true;
  if (relPathUnix.endsWith("/email/cron.ts")) return true;
  if (relPathUnix.endsWith(".cron.ts")) return true;
  const filename = path.basename(relPathUnix);
  return /(?:^|[-.])cron\.ts$/.test(filename) || /-cron\.ts$/.test(filename);
}

const files = walkFiles(SRC_ROOT)
  .map((absolute) => ({
    absolute,
    rel: path.relative(ROOT, absolute).split(path.sep).join("/"),
  }))
  .filter((entry) => isCronEntryPoint(entry.rel));

const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file.absolute, "utf8");
  if (text.includes(TENANT_AGNOSTIC_MARKER)) {
    console.log(`verify-scheduler-tenant-context: skip ${file.rel} (${TENANT_AGNOSTIC_MARKER})`);
    continue;
  }
  if (!TENANT_CONTEXT_RE.test(text)) continue;

  const hasGuardImportOrDef = GUARD_IMPORT_RE.test(text) || GUARD_LOCAL_DEF_RE.test(text);
  const hasGuardCall = GUARD_CALL_RE.test(text);
  if (hasGuardImportOrDef && hasGuardCall) continue;

  failures.push({
    file: file.rel,
    reason: !hasGuardImportOrDef
      ? "missing assertTenantContext import/definition"
      : "missing assertTenantContext(...) call",
  });
}

if (failures.length > 0) {
  console.error("verify-scheduler-tenant-context: FAIL");
  for (const failure of failures) {
    console.error(`  - ${failure.file}: ${failure.reason}`);
  }
  process.exit(1);
}

console.log(`verify-scheduler-tenant-context: OK (${files.length} cron entry files scanned)`);
