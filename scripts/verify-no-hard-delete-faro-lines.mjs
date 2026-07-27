#!/usr/bin/env node
/**
 * verify-no-hard-delete-faro-lines.mjs (F9-03)
 *
 * Faro daily re-import must supersede factor.faro_invoice_lines, never DELETE.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-hard-delete-faro-lines";
const SVC = "apps/backend/src/data-infra/data-infra.service.ts";
const MIG = "db/migrations/202609010060_f9_03_faro_invoice_lines_supersede.sql";
const DELETE_RE = /DELETE\s+FROM\s+factor\.faro_invoice_lines\b/i;
const EXCLUDE_DIR_RE = /(\/__tests__\/|\/tests\/|\.test\.|\.spec\.|e2e-)/i;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist") continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else if (/\.(ts|js|mjs|cjs)$/.test(ent.name)) out.push(abs);
  }
  return out;
}

export function assertNoHardDeleteFaroLines(opts = {}) {
  const root = opts.root ?? ROOT;
  const failures = [];
  const migAbs = path.join(root, MIG);
  if (!fs.existsSync(migAbs)) failures.push(`missing ${MIG}`);
  else {
    const sql = fs.readFileSync(migAbs, "utf8");
    if (!/DO NOT RUN ON PROD/i.test(sql)) failures.push(`${MIG} must carry DO NOT RUN ON PROD marker`);
    if (!/superseded_at/i.test(sql)) failures.push(`${MIG} must add superseded_at`);
  }
  const svcAbs = path.join(root, SVC);
  if (!fs.existsSync(svcAbs)) failures.push(`missing ${SVC}`);
  else {
    const src = fs.readFileSync(svcAbs, "utf8");
    if (DELETE_RE.test(src)) failures.push(`${SVC} must not DELETE FROM factor.faro_invoice_lines`);
    if (!/faro_daily_reimport/.test(src)) failures.push(`${SVC} must stamp superseded_reason faro_daily_reimport`);
    if (!/superseded_at IS NULL/.test(src)) failures.push(`${SVC} active reads must filter superseded_at IS NULL`);
  }
  const srcRoot = path.join(root, "apps/backend/src");
  if (fs.existsSync(srcRoot)) {
    for (const file of walk(srcRoot)) {
      const rel = path.relative(root, file);
      if (EXCLUDE_DIR_RE.test(rel)) continue;
      const text = fs.readFileSync(file, "utf8");
      if (DELETE_RE.test(text)) failures.push(`${rel}: hard DELETE factor.faro_invoice_lines forbidden`);
    }
  }
  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "f9-03-faro-"));
  fs.mkdirSync(path.join(tmp, "apps/backend/src/data-infra"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "db/migrations"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, MIG),
    "-- DO NOT RUN ON PROD\nALTER TABLE factor.faro_invoice_lines ADD COLUMN IF NOT EXISTS superseded_at timestamptz;\n"
  );
  fs.writeFileSync(
    path.join(tmp, SVC),
    "await client.query(`DELETE FROM factor.faro_invoice_lines WHERE daily_import_id = $1`, [importId]);\n"
  );
  const planted = assertNoHardDeleteFaroLines({ root: tmp });
  if (!planted.length) {
    console.error(`[${LABEL}] SELFTEST FAIL`);
    process.exit(1);
  }
  console.log(`[${LABEL}] SELFTEST PASS (${planted.length})`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const failures = assertNoHardDeleteFaroLines();
  if (failures.length) {
    console.error(`[${LABEL}] FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS — Faro lines supersede; no hard DELETE`);
}

main();
