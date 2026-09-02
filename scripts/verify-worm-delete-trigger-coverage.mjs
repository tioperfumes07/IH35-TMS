#!/usr/bin/env node
/**
 * GO-18 Gap 5 (corrected) — every table a display-id.ts MAX+1 generator reads must
 * carry trg_worm_refuse_delete → accounting.refuse_financial_row_delete() in migrations.
 *
 * Table list is DERIVED from display-id.ts (FROM accounting.<ident>). An eighth
 * generator is covered without editing this file. That is the difference between
 * a guard and a snapshot.
 *
 * Static on purpose (CI has no DB): scans db/migrations for the trigger attach.
 * Live Neon proof is pasted after migrate — this guard catches the regression a
 * PR can introduce (missing attach / dropped attach in SQL).
 *
 * Additive to verify-no-hard-delete-document-number-tables.mjs (#19839).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-worm-delete-trigger-coverage";
const DISPLAY_ID_REL = "apps/backend/src/accounting/display-id.ts";
const MIGRATIONS_REL = "db/migrations";
const TRIGGER = "trg_worm_refuse_delete";

const FROM_TABLE_RE = /\bFROM\s+(accounting\.[a-z_][a-z0-9_]*)/gi;

export function documentNumberTablesFromDisplayId(src) {
  const tables = new Set();
  FROM_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = FROM_TABLE_RE.exec(src))) {
    tables.add(m[1].toLowerCase());
  }
  return [...tables].sort();
}

/** True when any migration attaches trg_worm_refuse_delete to the qualified table. */
export function migrationDeclaresWormTrigger(sqlCorpus, qualifiedTable) {
  const [schema, table] = qualifiedTable.split(".");
  if (!schema || !table) return false;
  // Accept both ON accounting.expenses and ON ONLY accounting.expenses
  const onRe = new RegExp(
    String.raw`CREATE\s+TRIGGER\s+${TRIGGER}\s+BEFORE\s+DELETE\s+ON\s+(?:ONLY\s+)?${schema}\.${table}\b`,
    "i",
  );
  // Array FOREACH attach form used by older WORM sweeps
  const arrayRe = new RegExp(
    String.raw`'${schema}\.${table}'`,
    "i",
  );
  if (onRe.test(sqlCorpus)) return true;
  if (sqlCorpus.includes(TRIGGER) && arrayRe.test(sqlCorpus)) {
    // Only count array form when the same file also installs the WORM trigger name
    return /trg_worm_refuse_delete/i.test(sqlCorpus);
  }
  return false;
}

export function loadMigrationCorpus(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return "";
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
    .join("\n\n");
}

export function assertWormDeleteTriggerCoverage(opts = {}) {
  const root = opts.root ?? ROOT;
  const failures = [];
  const displayAbs = path.join(root, DISPLAY_ID_REL);
  if (!fs.existsSync(displayAbs)) {
    failures.push(`missing ${DISPLAY_ID_REL} — cannot derive MAX+1 tables`);
    return { failures, tables: [] };
  }
  const tables = documentNumberTablesFromDisplayId(fs.readFileSync(displayAbs, "utf8"));
  if (tables.length === 0) {
    failures.push(`${DISPLAY_ID_REL} has no FROM accounting.<table> — parser would miss an eighth generator`);
    return { failures, tables };
  }
  const corpus = loadMigrationCorpus(path.join(root, MIGRATIONS_REL));
  for (const t of tables) {
    if (!migrationDeclaresWormTrigger(corpus, t)) {
      failures.push(
        `${t}: missing ${TRIGGER} attach in ${MIGRATIONS_REL} (GO-18 Gap 5 — MAX+1 reuse on hard DELETE)`,
      );
    }
  }
  return { failures, tables };
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "go18-gap5-worm-"));
  const displayDir = path.join(tmp, "apps/backend/src/accounting");
  const migDir = path.join(tmp, "db/migrations");
  fs.mkdirSync(displayDir, { recursive: true });
  fs.mkdirSync(migDir, { recursive: true });

  const realDisplay = path.join(ROOT, DISPLAY_ID_REL);
  if (!fs.existsSync(realDisplay)) {
    console.error(`[${LABEL}] SELFTEST FAIL — missing ${DISPLAY_ID_REL}`);
    process.exit(1);
  }
  fs.copyFileSync(realDisplay, path.join(displayDir, "display-id.ts"));
  const tables = documentNumberTablesFromDisplayId(fs.readFileSync(realDisplay, "utf8"));
  if (tables.length < 7) {
    console.error(`[${LABEL}] SELFTEST FAIL — expected ≥7 tables from display-id.ts, got ${tables.length}`);
    process.exit(1);
  }

  // Plant migrations that cover ALL derived tables EXCEPT expenses (the known live gap class).
  const covered = tables.filter((t) => t !== "accounting.expenses");
  let i = 0;
  for (const t of covered) {
    fs.writeFileSync(
      path.join(migDir, `${String(++i).padStart(4, "0")}_worm.sql`),
      `CREATE TRIGGER ${TRIGGER} BEFORE DELETE ON ${t}\n  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();\n`,
    );
  }

  const planted = assertWormDeleteTriggerCoverage({ root: tmp });
  if (planted.failures.length === 0) {
    console.error(
      `[${LABEL}] SELFTEST FAIL — planted removal of ${TRIGGER} on accounting.expenses was not caught`,
    );
    process.exit(1);
  }
  if (!planted.failures.some((f) => f.includes("accounting.expenses"))) {
    console.error(`[${LABEL}] SELFTEST FAIL — failures did not name accounting.expenses: ${planted.failures.join(" | ")}`);
    process.exit(1);
  }

  console.log(
    `[${LABEL}] SELFTEST PASS — planted trigger removal caught (${planted.failures.length} failure(s)); tables=${tables.join(",")}`,
  );
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const { failures, tables } = assertWormDeleteTriggerCoverage();
  if (failures.length) {
    console.error(`[${LABEL}] FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `[${LABEL}] PASS — ${TRIGGER} declared for ${tables.length} display-id MAX+1 tables: ${tables.join(", ")}`,
  );
}

main();
