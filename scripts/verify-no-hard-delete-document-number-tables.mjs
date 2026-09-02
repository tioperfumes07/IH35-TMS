#!/usr/bin/env node
/**
 * GO-18 Gap 5 — the MAX+1 generators in display-id.ts are correct only while
 * those tables are never hard-deleted. This guard IS the safety mechanism.
 *
 * Table list is parsed FROM display-id.ts (FROM accounting.<ident>). An eighth
 * generator is covered without editing this file.
 *
 * Additive: does not replace verify-no-hard-delete-bill-lines.mjs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-hard-delete-document-number-tables";
const DISPLAY_ID_REL = "apps/backend/src/accounting/display-id.ts";

const FROM_TABLE_RE = /\bFROM\s+(accounting\.[a-z_][a-z0-9_]*)/gi;
const SCAN_EXTS = new Set([".ts", ".js", ".mjs", ".cjs", ".mts", ".cts", ".sql"]);
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", "coverage", ".next", "build"]);

/** Tests, e2e harnesses, and this family's planted strings are not production write paths. */
const EXCLUDE_PATH_RE =
  /(\/__tests__\/|\/tests\/|\/verify-steps\/|\.test\.|\.spec\.|e2e-|verify-no-hard-delete-document-number-tables)/i;

export function documentNumberTablesFromDisplayId(src) {
  const tables = new Set();
  FROM_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = FROM_TABLE_RE.exec(src))) {
    tables.add(m[1].toLowerCase());
  }
  return [...tables].sort();
}

function skipDir(name) {
  return SKIP_DIR_NAMES.has(name);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) {
      if (ent.name === ".git") continue;
    }
    if (ent.isDirectory()) {
      if (skipDir(ent.name)) continue;
      walk(path.join(dir, ent.name), out);
      continue;
    }
    const ext = path.extname(ent.name);
    if (!SCAN_EXTS.has(ext)) continue;
    out.push(path.join(dir, ent.name));
  }
  return out;
}

function deleteFromRe(qualifiedTable) {
  const ident = qualifiedTable.replace(/\./g, "\\.");
  return new RegExp(`\\bDELETE\\s+FROM\\s+(?:ONLY\\s+)?${ident}\\b`, "i");
}

function scanRoots(root) {
  return [
    path.join(root, "apps/backend/src"),
    path.join(root, "apps/frontend/src"),
    path.join(root, "db/migrations"),
    path.join(root, "scripts"),
  ];
}

export function assertNoHardDeleteDocumentNumberTables(opts = {}) {
  const root = opts.root ?? ROOT;
  const failures = [];
  const displayAbs = path.join(root, DISPLAY_ID_REL);
  if (!fs.existsSync(displayAbs)) {
    failures.push(`missing ${DISPLAY_ID_REL} — cannot derive MAX+1 tables`);
    return failures;
  }
  const displaySrc = fs.readFileSync(displayAbs, "utf8");
  const tables = documentNumberTablesFromDisplayId(displaySrc);
  if (tables.length === 0) {
    failures.push(`${DISPLAY_ID_REL} has no FROM accounting.<table> — parser would miss an eighth generator`);
    return failures;
  }

  const patterns = tables.map((t) => ({ table: t, re: deleteFromRe(t) }));

  for (const scanRoot of scanRoots(root)) {
    if (!fs.existsSync(scanRoot)) continue;
    for (const file of walk(scanRoot)) {
      const rel = path.relative(root, file);
      if (EXCLUDE_PATH_RE.test(rel.replaceAll("\\", "/"))) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const { table, re } of patterns) {
        re.lastIndex = 0;
        if (re.test(text)) {
          failures.push(`${rel}: hard DELETE FROM ${table} forbidden (GO-18 Gap 5 MAX+1 reuse)`);
        }
      }
    }
  }
  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "go18-gap5-display-id-"));
  const displayDir = path.join(tmp, "apps/backend/src/accounting");
  const plantDir = path.join(tmp, "apps/backend/src/accounting");
  fs.mkdirSync(displayDir, { recursive: true });
  const realDisplay = path.join(ROOT, DISPLAY_ID_REL);
  if (!fs.existsSync(realDisplay)) {
    console.error(`[${LABEL}] SELFTEST FAIL — missing ${DISPLAY_ID_REL} on this tree`);
    process.exit(1);
  }
  fs.copyFileSync(realDisplay, path.join(displayDir, "display-id.ts"));
  fs.writeFileSync(
    path.join(plantDir, "planted-hard-delete.ts"),
    "await client.query(`DELETE FROM accounting.credit_memos WHERE id = $1`);\n",
  );

  const planted = assertNoHardDeleteDocumentNumberTables({ root: tmp });
  if (planted.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAIL — planted DELETE FROM accounting.credit_memos was not caught`);
    process.exit(1);
  }

  const derived = documentNumberTablesFromDisplayId(fs.readFileSync(realDisplay, "utf8"));
  if (derived.length < 7) {
    console.error(`[${LABEL}] SELFTEST FAIL — expected ≥7 tables from display-id.ts, got ${derived.length}`);
    process.exit(1);
  }

  console.log(
    `[${LABEL}] SELFTEST PASS — planted DELETE caught (${planted.length} failure(s)); tables=${derived.join(",")}`,
  );
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = assertNoHardDeleteDocumentNumberTables();
  if (failures.length) {
    console.error(`[${LABEL}] FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  const tables = documentNumberTablesFromDisplayId(fs.readFileSync(path.join(ROOT, DISPLAY_ID_REL), "utf8"));
  console.log(
    `[${LABEL}] PASS — no hard DELETE of ${tables.length} display-id MAX+1 tables: ${tables.join(", ")}`,
  );
}

main();
