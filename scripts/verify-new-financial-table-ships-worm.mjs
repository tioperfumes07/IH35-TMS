#!/usr/bin/env node
/**
 * verify-new-financial-table-ships-worm.mjs — ROUND 155 (Claude Lead).
 *
 * WHY THIS EXISTS, AND WHY THE EXISTING RATCHET WAS NOT ENOUGH.
 *
 * verify-worm-coverage-ratchet catches an unprotected new financial table by COUNT DRIFT:
 * unprotected_count rose from its baseline, so something new landed unprotected. That is a real
 * control and it stays. But it has two properties that cost this repo a full night of throughput:
 *
 *   1. It reports a NUMBER, not a TABLE. "89 -> 93" does not say which four, or which migration
 *      introduced them, so whoever hits the red has to go find that out before they can act.
 *   2. It fires on the MERGE, not on the AUTHOR. The check engine's 202614330000 (#22910) created
 *      four banking money tables with RLS and no WORM. It merged green for its own author and then
 *      turned main red for every other seat -- CC-1, CC-2 and CC-3 all stopped pushing behind a
 *      regression none of them wrote. A count-based ratchet cannot tell the author "you just did
 *      this", because at author time the count has not drifted yet relative to THEIR baseline.
 *
 * So this guard asserts the rule directly, per table, naming names:
 *
 *   A migration that CREATEs a table in a financial schema must, in that same migration or a later
 *   one, attach the WORM (void-not-delete) delete-refusal trigger to it -- or the table must be
 *   listed in the deliberate EXEMPT set below with a written reason.
 *
 * EXEMPT is not an escape hatch for "I do not want to think about it". Every entry names the table
 * and says in one line why deleting a row from it destroys nothing that money depends on. Adding an
 * entry is a judgment being recorded, which is the same standard the ratchet's baseline file sets:
 * "decide whether the new table needs WORM", never "raise the number so the build goes green".
 *
 * STATIC, same trade as the ratchet: it reads db/migrations, so it runs in CI with no database. It
 * verifies what the migrations DECLARE, not what prod currently HAS. It does not replace a live
 * prod read; it catches the regression that starts in the repo, which is every regression a PR can
 * introduce.
 *
 *   node scripts/verify-new-financial-table-ships-worm.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-new-financial-table-ships-worm";
const MIGRATIONS = path.join(ROOT, "db", "migrations");

/** Same four schemas the WORM ratchet treats as money. Deliberately NOT fuel/mdata. */
const FINANCIAL_SCHEMAS = ["accounting", "banking", "driver_finance", "factoring"];

const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\.([a-z_0-9]+)/gi;
const LITERAL_TRIGGER =
  /CREATE\s+TRIGGER\s+\S+\s+BEFORE\s+((?:UPDATE|DELETE|TRUNCATE|INSERT)(?:\s+OR\s+(?:UPDATE|DELETE|TRUNCATE|INSERT))*)\s+ON\s+([a-z_]+)\.([a-z_0-9]+)/gi;
const ARRAY_BLOCK = /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[(.*?)\]/gis;
const QUALIFIED = /'([a-z_]+\.[a-z_0-9]+)'/gi;

/**
 * Tables in a financial schema that deliberately carry NO WORM trigger. One line each, saying why a
 * deleted row destroys nothing money depends on. Grandfathered entries are marked as such: this
 * guard is new, the tables are not, and silently blessing 80-odd pre-existing tables as "reviewed"
 * would be exactly the fake-green this repo forbids. The shrink-only ratchet owns driving that list
 * down; this guard owns stopping it from GROWING.
 */
const EXEMPT = new Map([
  // (no new-table exemptions granted yet — every table created after this guard landed is either
  // WORM-protected or listed here with a reason)
]);

/** Everything that already existed when this guard landed. Not a blessing — a starting line. */
const GRANDFATHERED_BEFORE = "202614330000";

export function scan(dir = MIGRATIONS) {
  /** table -> migration number that first created it */
  const createdIn = new Map();
  const protectedTables = new Set();
  if (!fs.existsSync(dir)) return { createdIn, protectedTables };

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const number = file.split("_")[0];

    for (const m of sql.matchAll(CREATE_TABLE)) {
      const schema = m[1].toLowerCase();
      const table = m[2].toLowerCase();
      if (!FINANCIAL_SCHEMAS.includes(schema)) continue;
      const qualified = `${schema}.${table}`;
      if (!createdIn.has(qualified)) createdIn.set(qualified, number);
    }

    // Both attach forms, same as the ratchet parses: a literal CREATE TRIGGER, and the
    // FOREACH ... IN ARRAY ARRAY[...] loop form that the sweep migrations use.
    for (const m of sql.matchAll(LITERAL_TRIGGER)) {
      if (!/DELETE/i.test(m[1])) continue;
      protectedTables.add(`${m[2].toLowerCase()}.${m[3].toLowerCase()}`);
    }
    for (const block of sql.matchAll(ARRAY_BLOCK)) {
      if (!/trg_worm_refuse_delete|refuse_financial_row_delete/i.test(sql)) continue;
      for (const q of block[1].matchAll(QUALIFIED)) protectedTables.add(q[1].toLowerCase());
    }
  }
  return { createdIn, protectedTables };
}

export function audit({ createdIn, protectedTables }, grandfatheredBefore = GRANDFATHERED_BEFORE) {
  const failures = [];
  let checked = 0;
  for (const [table, number] of createdIn) {
    if (number < grandfatheredBefore) continue; // pre-existing debt — the shrink-only ratchet owns it
    checked += 1;
    if (protectedTables.has(table)) continue;
    if (EXEMPT.has(table)) continue;
    failures.push(
      `${table} — created by migration ${number} in a financial schema with no WORM delete-refusal ` +
        `trigger. Attach accounting.refuse_financial_row_delete() to it, or add it to EXEMPT in ` +
        `${LABEL}.mjs with a one-line reason why deleting a row destroys nothing money depends on.`
    );
  }
  return { failures, checked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { failures, checked } = audit(scan());
  if (failures.length > 0) {
    console.error(`${LABEL} FAIL — new financial table(s) landed without WORM:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      `\nWORM is void-not-delete at the database level. It exists because 139 real financial rows ` +
        `were destroyed on prod and could not be recovered. Do not weaken it to make a build pass.`
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — ${checked} financial table(s) created at or after ${GRANDFATHERED_BEFORE}; every one ` +
      `is WORM-protected or deliberately exempt`
  );
}
