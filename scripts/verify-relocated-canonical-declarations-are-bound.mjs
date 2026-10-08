#!/usr/bin/env node
/**
 * GUARD OF THE GUARD — a relocated CANONICAL-CHECK declaration must be BOUND to a real migration
 * that really creates the table it claims to cover.
 *
 * WHY THIS EXISTS. scripts/canonical-ledger-declarations.json lets a '-- CANONICAL-CHECK:' block
 * live outside its migration, for the one case where it cannot live inside: the migration was
 * already applied to production, and applied migrations are immutable
 * (verify:applied-migrations-immutable — editing one makes db-migrate refuse to migrate and
 * red-lines every backend pre-deploy). That happened twice, and main went RED on
 * verify:no-duplicate-financial-ledger for both, blocking every seat:
 *   accounting.expenses_review_queue               applied 2026-09-29T20:44:07Z
 *   driver_finance.settlement_line_item_splits     applied 2026-09-30T11:26:26Z
 *
 * A relocation mechanism is exactly how a real declaration requirement rots into a formality. This
 * guard is the fence around it. Every entry must:
 *   - name a migration that EXISTS in db/migrations
 *   - and that migration must actually CREATE the table the entry claims
 *   - carry a real '-- CANONICAL-CHECK:' block, not a placeholder
 *   - record why it could not be declared in the migration, and when that migration was applied
 * and the file must never grow into a bypass: an entry for a table whose migration is NOT applied
 * has no excuse and must declare in-file instead.
 *
 * SELFTEST: --selftest plants each abuse and requires the guard to catch it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DECL = "scripts/canonical-ledger-declarations.json";
const MIGRATIONS_DIR = path.resolve(ROOT, "db/migrations");
const CREATE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi;

function migrationCreates(migrationSql, fqName) {
  for (const m of migrationSql.matchAll(CREATE_RE)) {
    if (`${m[1].toLowerCase()}.${m[2].toLowerCase()}` === fqName) return true;
  }
  return false;
}

export function checkDeclarations(file, readMigration, isHeld = () => false) {
  const failures = [];
  if (!file || typeof file !== "object") return ["scripts/canonical-ledger-declarations.json is missing or not an object"];
  const decls = file.declarations;
  if (!decls || typeof decls !== "object") return ["the file must carry a 'declarations' object"];

  for (const [fqName, entry] of Object.entries(decls)) {
    const where = `declarations["${fqName}"]`;
    if (!/^[a-z_]+\.[a-z_][a-z0-9_]*$/.test(fqName)) {
      failures.push(`${where}: key must be a schema.table name`);
      continue;
    }
    if (!entry || typeof entry !== "object") {
      failures.push(`${where}: entry must be an object`);
      continue;
    }
    for (const field of ["migration", "text", "why_not_in_migration"]) {
      if (typeof entry[field] !== "string" || entry[field].trim().length === 0) {
        failures.push(`${where}: missing '${field}' — a relocation with no ${field} is an unexplained bypass`);
      }
    }
    // A HELD migration (db/migrations/.held-migrations.json) is the explained case where no
    // applied timestamp can exist yet: applied_at_utc stays null and applied_ledger says so.
    if (isHeld(entry.migration)) {
      if (entry.applied_at_utc !== null && typeof entry.applied_at_utc !== "string") {
        failures.push(`${where}: held-migration 'applied_at_utc' must be null or a held explanation string`);
      }
      if (typeof entry.applied_ledger !== "string" || !/not applied|held/i.test(entry.applied_ledger)) {
        failures.push(`${where}: held-migration 'applied_ledger' must state the migration is NOT APPLIED/HELD`);
      }
    } else if (typeof entry.applied_at_utc !== "string" || entry.applied_at_utc.trim().length === 0) {
      failures.push(`${where}: missing 'applied_at_utc' — a relocation with no applied_at_utc is an unexplained bypass`);
    }
    if (typeof entry.text === "string" && !/--\s*CANONICAL-CHECK:/i.test(entry.text)) {
      failures.push(`${where}: 'text' must contain a real '-- CANONICAL-CHECK:' block`);
    }
    if (typeof entry.text === "string" && entry.text.trim().length < 200) {
      failures.push(`${where}: 'text' is too short to be a real reconciliation — a placeholder is worse than nothing`);
    }
    if (!isHeld(entry.migration) && typeof entry.applied_at_utc === "string" && !/^\d{4}-\d{2}-\d{2}T/.test(entry.applied_at_utc)) {
      failures.push(`${where}: 'applied_at_utc' must be the real applied timestamp from the migration ledger`);
    }
    if (typeof entry.migration === "string" && entry.migration.length > 0) {
      const sql = readMigration(entry.migration);
      if (sql === null) {
        failures.push(`${where}: migration '${entry.migration}' does not exist in db/migrations`);
      } else if (!migrationCreates(sql, fqName)) {
        failures.push(`${where}: migration '${entry.migration}' does not CREATE ${fqName} — a declaration must be bound to the migration it explains`);
      }
    }
  }
  return failures;
}

const NAME = "verify-relocated-canonical-declarations-are-bound";
const readMigrationFromDisk = (f) => {
  const abs = path.join(MIGRATIONS_DIR, f);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
};

const heldSet = (() => {
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, ".held-migrations.json"), "utf8"));
    return new Set((reg.held || []).map((h) => h.file));
  } catch {
    return new Set();
  }
})();
const isHeldMigration = (f) => typeof f === "string" && heldSet.has(f);

if (process.argv.includes("--selftest")) {
  const good = JSON.parse(fs.readFileSync(path.join(ROOT, DECL), "utf8"));
  const clone = () => JSON.parse(JSON.stringify(good));
  const firstKey = Object.keys(good.declarations)[0];

  const mut = [];
  mut.push(["baseline (the real file)", good, 0]);
  { const c = clone(); c.declarations["driver_finance.made_up_ledger"] = c.declarations[firstKey]; mut.push(["entry for a table no migration creates", c, 1]); }
  { const c = clone(); c.declarations[firstKey].migration = "9999_does_not_exist.sql"; mut.push(["entry names a migration that does not exist", c, 1]); }
  { const c = clone(); c.declarations[firstKey].migration = "0001_audit_init.sql"; mut.push(["entry names a migration that does not create the table", c, 1]); }
  { const c = clone(); c.declarations[firstKey].text = "-- nothing to see"; mut.push(["text has no CANONICAL-CHECK block", c, 1]); }
  { const c = clone(); c.declarations[firstKey].text = "-- CANONICAL-CHECK: fine"; mut.push(["text is a placeholder", c, 1]); }
  { const c = clone(); delete c.declarations[firstKey].why_not_in_migration; mut.push(["no stated reason it could not go in the migration", c, 1]); }
  { const c = clone(); delete c.declarations[firstKey].applied_at_utc; mut.push(["no applied timestamp", c, 1]); }

  let ok = 0;
  for (const [label, obj, expectMin] of mut) {
    const found = checkDeclarations(obj, readMigrationFromDisk, isHeldMigration).length;
    const pass = expectMin === 0 ? found === 0 : found >= expectMin;
    if (pass) ok += 1;
    else console.error(`  selftest MISS: ${label} -> ${found}, expected ${expectMin === 0 ? "0" : ">=1"}`);
  }
  console.log(`${NAME} selftest ${ok}/${mut.length} ${ok === mut.length ? "OK" : "FAILED"}`);
  if (ok !== mut.length) process.exit(1);
  console.log("--- live ---");
}

let parsed = null;
try { parsed = JSON.parse(fs.readFileSync(path.join(ROOT, DECL), "utf8")); } catch { parsed = null; }
if (parsed === null) {
  console.log(`${NAME} PASS — no relocated declarations file on disk (nothing to fence)`);
  process.exit(0);
}
const failures = checkDeclarations(parsed, readMigrationFromDisk, isHeldMigration);
if (failures.length > 0) {
  console.error(`${NAME} FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${NAME} PASS — ${Object.keys(parsed.declarations).length} relocated declaration(s), each bound to a migration that really creates its table`
);
