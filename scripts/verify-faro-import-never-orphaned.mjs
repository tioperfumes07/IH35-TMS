#!/usr/bin/env node
// Lead ROUND 330.6 (CC-1, rehearsed on a Neon fork) — a factor.faro_daily_imports header can never outlive all of its
// live lines. Prod held two headers whose lines were all gone; the factor reconciliation showed both statements with a
// full-amount variance against zero lines. Fails if migration 202615280100 stops installing the deferred constraint
// trigger, if a later migration drops it, or if any backend / ops code hard-deletes faro_invoice_lines.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-faro-import-never-orphaned";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = "db/migrations";
const FIX = "202615280100_faro_import_header_never_orphaned.sql";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (/node_modules|__tests__|\.git$|dist/.test(e)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|mts|mjs|js)$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}

export function problems(migrations, code) {
  const p = [];
  const fix = migrations.find((m) => m.name === FIX);
  if (!fix || !/CREATE CONSTRAINT TRIGGER trg_faro_lines_keep_import_live[\s\S]{0,200}DEFERRABLE INITIALLY DEFERRED/.test(fix.sql)) p.push(`${MIG_DIR}/${FIX} must install the deferred constraint trigger`);
  for (const m of migrations) if (m.name > FIX && /DROP TRIGGER[^;]*trg_faro_lines_keep_import_live/i.test(m.sql)) p.push(`${MIG_DIR}/${m.name} drops the Faro orphan guard`);
  for (const { file, src } of code) if (/DELETE\s+FROM\s+factor\.faro_invoice_lines\b/i.test(src)) p.push(`${file}: hard-deletes factor.faro_invoice_lines (supersede, or delete the import header with its lines)`);
  return p;
}

function load() {
  const migrations = readdirSync(path.join(ROOT, MIG_DIR)).filter((f) => f.endsWith(".sql")).sort().map((name) => ({ name, sql: readFileSync(path.join(ROOT, MIG_DIR, name), "utf8") }));
  const code = [...walk(path.join(ROOT, "apps/backend/src")), ...walk(path.join(ROOT, "scripts/ops"))].map((f) => ({ file: path.relative(ROOT, f), src: readFileSync(f, "utf8") }));
  return { migrations, code };
}

export function run() { const { migrations, code } = load(); return problems(migrations, code); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { migrations, code } = load();
  const own = problems(migrations, code);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    if (!problems([...migrations, { name: "209999990000_x.sql", sql: "DROP TRIGGER IF EXISTS trg_faro_lines_keep_import_live ON factor.faro_invoice_lines;" }], code).length) { console.error(`${LABEL} --selftest FAIL — trigger drop not caught`); process.exit(1); }
    if (!problems(migrations, [...code, { file: "plant.ts", src: "await client.query(`DELETE FROM factor.faro_invoice_lines WHERE id = $1`)" }]).length) { console.error(`${LABEL} --selftest FAIL — hard delete not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; 2/2 plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — a Faro import header can never be left without live lines.`);
}
