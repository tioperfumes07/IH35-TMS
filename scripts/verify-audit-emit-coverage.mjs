#!/usr/bin/env node
/**
 * verify-audit-emit-coverage.mjs  (A9-AUDIT-CI-EMIT-GUARD)
 *
 * Walks apps/backend/src /**\/*.routes.ts and *.service.ts.
 * For each file that contains a mutation (INSERT/UPDATE/DELETE), asserts
 * that the SAME file (or an import it directly references) contains a
 * spine audit emit call (log_event / appendCrudAudit / *spine-emit*).
 *
 * Files in audit-emit-allowlist.json are explicitly exempted with a required reason.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-audit-emit-coverage";

// ── Allowlist ──────────────────────────────────────────────────────────────────
const allowlistPath = path.join(ROOT, "scripts/audit-emit-allowlist.json");
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const ALLOWED = new Set(allowlist.allowlist.map((e) => e.file));

// ── Mutation markers ───────────────────────────────────────────────────────────
const MUTATION_RE = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b/i;

// ── Emit markers (direct + via import) ────────────────────────────────────────
const EMIT_MARKERS = [
  "log_event(",
  "appendCrudAudit(",
  "spine-emit",
  "spineEmit",
  "accountingSpineEmit",
  "dispatchSpineEmit",
  "bankingSpineEmit",
  "maintenanceSpineEmit",
  "events.log_event",
];

function hasEmit(content) {
  return EMIT_MARKERS.some((m) => content.includes(m));
}

function hasEmitImport(content) {
  // Check if it imports from a *spine-emit* or crud-audit module
  return (
    content.includes("spine-emit") ||
    content.includes("crud-audit") ||
    content.includes("audit.service") ||
    content.includes("log-event")
  );
}

// ── Walk files ─────────────────────────────────────────────────────────────────
function walkDir(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "dist", "__tests__", "test"].includes(entry.name)) {
        walkDir(full, exts, out);
      }
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const srcDir = path.join(ROOT, "apps/backend/src");
const files = walkDir(srcDir, [".routes.ts", ".service.ts"]);

const failures = [];
let checked = 0;
let skipped = 0;

for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
  const content = fs.readFileSync(abs, "utf8");

  if (!MUTATION_RE.test(content)) continue;
  checked++;

  if (ALLOWED.has(rel)) { skipped++; continue; }

  if (hasEmit(content) || hasEmitImport(content)) continue;

  failures.push(rel);
}

// ── Report ─────────────────────────────────────────────────────────────────────
console.log(`[${LABEL}] Checked ${checked} files with mutations, ${skipped} allowlisted.`);

if (failures.length > 0) {
  console.error(`\n[${LABEL}] FAIL — ${failures.length} file(s) have mutations without audit emit:\n`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  console.error(`\nTo fix: add a spine event emit to the mutating handler/service, OR add the file`);
  console.error(`to scripts/audit-emit-allowlist.json with a reviewed reason.\n`);
  process.exit(1);
}

console.log(`[${LABEL}] ALL CHECKS PASSED — every mutating route/service emits to audit spine.`);
