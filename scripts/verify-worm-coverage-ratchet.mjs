#!/usr/bin/env node
/**
 * verify-worm-coverage-ratchet.mjs — ACCT-F152. The shrink-only ratchet ACCT-F141 promised and never got.
 *
 * WHY THIS EXISTS. The merged WORM migration (202612220000, #4607) states in its own header that the
 * control is "verified where it matters — against prod, by the shrink-only ratchet
 * 2729-verify-financial-tables-not-deletable.mjs". That file was never written. So the strongest
 * data-integrity control in the system — nine financial tables made physically undeletable after 139
 * rows were confirmed destroyed on prod, unrecoverable, with nothing recording they had existed — has
 * had nothing watching it since the day it landed. Drop the trigger, delete the array entry, or revert
 * the migration and CI stays green. A control nothing verifies is a control you are guessing about.
 *
 * The registered law LAW-2026-08-05-A6-WORM-VOID-NOT-DELETE points at
 * verify-inv2-no-hard-delete-accounting.mjs, which is a DIFFERENT check: it greps application source
 * for `DELETE FROM` against three hardcoded tables. It says nothing about which tables carry the
 * database-level trigger, and nothing about coverage moving backwards. verify-law-registry is green
 * because that file exists — existence is all it checks. Neither guard covers this.
 *
 * WHAT IT ASSERTS, and it is deliberately two things:
 *
 *   1. NO REGRESSION IN THE PROTECTED SET. Every table WORM-protected at baseline must still be
 *      protected. This is absolute, not a count: dropping one table's protection while adding another
 *      would keep a count flat, so the check is per-table.
 *   2. COVERAGE ONLY SHRINKS. The number of financial tables WITHOUT protection may fall, never rise.
 *      New financial tables are the common case and they land unprotected, so this makes the debt
 *      visible and one-way rather than silently growing.
 *
 * Measured today: 141 tables across accounting/banking/driver_finance/factoring, 12 protected, 129
 * not. Those 129 are not a hidden emergency — most are config, staging and import-batch tables rather
 * than ledgers — but which ones deserve WORM is a judgment call per table, and the point of a ratchet
 * is that the judgment gets made deliberately instead of by default.
 *
 * STATIC, ON PURPOSE. It reads db/migrations, so it runs in CI with no database. The trade is real and
 * worth naming: it verifies what the migrations DECLARE, not what prod currently HAS. Those diverge —
 * prod has diverged from migrations before. This catches the regression that starts in the repo, which
 * is every regression a PR can introduce. It does not replace a live prod read.
 *
 * Both attach forms are parsed, because ACCT-F141 uses the second and a naive scan misses it entirely:
 *   - literal   CREATE TRIGGER <n> BEFORE <event list containing DELETE> ON <schema>.<table>
 *   - array     FOREACH t IN ARRAY ARRAY[ '<schema>.<table>', ... ] LOOP ... trg_worm_refuse_delete
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-worm-coverage-ratchet";
const BASELINE = path.join(ROOT, "scripts", "worm-coverage-baseline.json");

/** Schemas holding money ledgers. Deliberately NOT fuel/mdata: those are operational, not the ledger. */
const FINANCIAL_SCHEMAS = ["accounting", "banking", "driver_finance", "factoring"];

const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\.([a-z_0-9]+)/gi;
const LITERAL_TRIGGER = /CREATE\s+TRIGGER\s+\S+\s+BEFORE\s+((?:UPDATE|DELETE|TRUNCATE|INSERT)(?:\s+OR\s+(?:UPDATE|DELETE|TRUNCATE|INSERT))*)\s+ON\s+([a-z_]+)\.([a-z_0-9]+)/gi;
const ARRAY_BLOCK = /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[(.*?)\]/gis;
const QUALIFIED = /'([a-z_]+\.[a-z_0-9]+)'/gi;

export function scanMigrations(dir = path.join(ROOT, "db", "migrations")) {
  const financial = new Set();
  const protectedTables = new Set();
  if (!fs.existsSync(dir)) return { financial, protectedTables };

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");

    for (const m of sql.matchAll(CREATE_TABLE)) {
      const [schema, table] = [m[1].toLowerCase(), m[2].toLowerCase()];
      if (FINANCIAL_SCHEMAS.includes(schema)) financial.add(`${schema}.${table}`);
    }
    for (const m of sql.matchAll(LITERAL_TRIGGER)) {
      const events = m[1].toUpperCase().split(/\s+OR\s+/);
      if (events.includes("DELETE")) protectedTables.add(`${m[2].toLowerCase()}.${m[3].toLowerCase()}`);
    }
    // Array-driven attach: only trust it when the file actually installs the WORM trigger, so an
    // unrelated FOREACH over table names cannot be mistaken for protection.
    if (sql.includes("trg_worm_refuse_delete")) {
      for (const block of sql.matchAll(ARRAY_BLOCK)) {
        for (const q of block[1].matchAll(QUALIFIED)) protectedTables.add(q[1].toLowerCase());
      }
    }
  }
  return { financial, protectedTables };
}

export function evaluate(scan, baseline) {
  const wormed = [...scan.financial].filter((t) => scan.protectedTables.has(t)).sort();
  const unprotected = [...scan.financial].filter((t) => !scan.protectedTables.has(t)).sort();
  const problems = [];

  const lost = (baseline.protected_tables ?? []).filter((t) => !wormed.includes(t));
  if (lost.length) {
    problems.push(
      `${lost.length} table(s) LOST WORM protection — this is a one-way control:\n` +
        lost.map((t) => `    - ${t}`).join("\n")
    );
  }
  if (unprotected.length > (baseline.unprotected_count ?? Infinity)) {
    problems.push(
      `unprotected financial tables rose ${baseline.unprotected_count} -> ${unprotected.length}. ` +
        `New financial tables land unprotected; decide deliberately whether each needs WORM, then ` +
        `LOWER the baseline. Never raise it.`
    );
  }
  return { wormed, unprotected, problems };
}

function run() {
  if (!fs.existsSync(BASELINE)) {
    console.error(`${LABEL} FAIL — baseline missing at ${path.relative(ROOT, BASELINE)}`);
    return 1;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const { wormed, unprotected, problems } = evaluate(scanMigrations(), baseline);

  if (problems.length) {
    console.error(`${LABEL} FAIL — WORM coverage moved backwards:\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `\nWORM is void-not-delete at the database level. It exists because 139 real financial rows were ` +
        `destroyed on prod and could not be recovered. Do not weaken it to make a build pass.\n`
    );
    return 1;
  }
  if (unprotected.length < (baseline.unprotected_count ?? 0)) {
    console.log(
      `${LABEL} OK — coverage IMPROVED: ${wormed.length} protected, ${unprotected.length} unprotected ` +
        `(baseline ${baseline.unprotected_count}). LOWER unprotected_count in ${path.basename(BASELINE)} to lock it in.`
    );
    return 0;
  }
  console.log(`${LABEL} OK — ${wormed.length} financial table(s) WORM-protected, ${unprotected.length} not (at baseline)`);
  return 0;
}

function selftest() {
  const failures = [];
  const scan = {
    financial: new Set(["accounting.bills", "accounting.bill_lines", "accounting.staging"]),
    protectedTables: new Set(["accounting.bills", "accounting.bill_lines"]),
  };
  const base = { protected_tables: ["accounting.bills", "accounting.bill_lines"], unprotected_count: 1 };

  if (evaluate(scan, base).problems.length !== 0) failures.push("case1 FAIL — at baseline must be GREEN.");

  // regression: a table loses protection
  const lost = { ...scan, protectedTables: new Set(["accounting.bills"]) };
  if (evaluate(lost, base).problems.length === 0) failures.push("case2 FAIL — losing WORM on a table must go RED.");

  // growth: a new unprotected financial table appears
  const grew = { financial: new Set([...scan.financial, "accounting.newledger"]), protectedTables: scan.protectedTables };
  if (evaluate(grew, base).problems.length === 0) failures.push("case3 FAIL — rising unprotected count must go RED.");

  // improvement must NOT fail
  const better = { ...scan, protectedTables: new Set([...scan.protectedTables, "accounting.staging"]) };
  if (evaluate(better, base).problems.length !== 0) failures.push("case4 FAIL — improving coverage must stay GREEN.");

  const multiEvent = "CREATE TRIGGER t BEFORE UPDATE OR DELETE OR TRUNCATE ON accounting.bills FOR EACH STATEMENT EXECUTE FUNCTION block();";
  const deleteOnly = "CREATE TRIGGER t BEFORE DELETE ON accounting.bills FOR EACH ROW EXECUTE FUNCTION block();";
  const updateOnly = "CREATE TRIGGER t BEFORE UPDATE ON accounting.bills FOR EACH ROW EXECUTE FUNCTION block();";
  const afterDelete = "CREATE TRIGGER t AFTER DELETE ON accounting.bills FOR EACH ROW EXECUTE FUNCTION audit();";
  if (![...multiEvent.matchAll(LITERAL_TRIGGER)].some((m) => m[1].toUpperCase().split(/\s+OR\s+/).includes("DELETE"))) failures.push("case5 FAIL — multi-event BEFORE DELETE protection must be detected.");
  if (![...deleteOnly.matchAll(LITERAL_TRIGGER)].some((m) => m[1].toUpperCase() === "DELETE")) failures.push("case6 FAIL — DELETE-only protection must remain detected.");
  if ([...updateOnly.matchAll(LITERAL_TRIGGER)].some((m) => m[1].toUpperCase().split(/\s+OR\s+/).includes("DELETE"))) failures.push("case7 FAIL — UPDATE-only trigger must not count.");
  if ([...afterDelete.matchAll(LITERAL_TRIGGER)].length !== 0) failures.push("case8 FAIL — AFTER DELETE audit trigger must not count.");

  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 8/8 ratchet and literal-trigger parser cases`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? selftest() : run());
}
