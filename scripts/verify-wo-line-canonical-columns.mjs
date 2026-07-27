#!/usr/bin/env node
/**
 * verify-wo-line-canonical-columns (MNT-PHANTOM-01/02/03)
 *
 * THE DEFECT THIS PINS. maintenance.work_order_lines has NO `id`, NO `work_order_id` and NO `amount`
 * column. Verified live on br-fancy-credit-akjnd07a: id=0, work_order_id=0, amount=0 — the real
 * columns are `uuid`, `work_order_uuid` and `total_cost numeric(12,2)`. Three production paths named
 * the phantom columns and therefore threw Postgres 42703 on EVERY call:
 *
 *   - the WO detail endpoint could never return its cost lines;
 *   - the WO cost-line DELETE never executed (so its posted-bill refusal was never reached);
 *   - the severe-repair cost recompute never produced a figure, which means the owner-locked $7,000
 *     capitalize-vs-expense threshold (A4-D6 / MNT-ECON-02) was never evaluated against real cost.
 *     maintenance.severe_repair_estimates is empty on prod, consistent with that.
 *
 * WHY A DEDICATED GUARD when verify-sql-column-existence exists. That guard covers this table and
 * DID detect one of the three — and the finding was frozen into its allowlist as an "accepted false
 * positive" (removed in the same commit as this file). The other two were invisible to it: one sat
 * inside a `WITH ... AS (...)` CTE, which that guard skips wholesale by design. This guard names the
 * three corrected identifiers directly, so the specific regression cannot return regardless of how
 * the generic scanner's scope evolves.
 *
 * NOT ASSERTED HERE: the generic phantom-column class. That belongs to verify-sql-column-existence;
 * a v2 extension teaching it to read CTEs is proven to catch MNT-PHANTOM-02 and is held for its own
 * PR because it surfaces a separate, still-unfixed defect (layover detection — see the PR body).
 *
 * Usage: node scripts/verify-wo-line-canonical-columns.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Real columns on maintenance.work_order_lines, prod-verified 2026-07-27. */
const PHANTOM = ["work_order_id", "amount"];
const FILES = [
  "apps/backend/src/work-orders/work-orders.routes.ts",
  "apps/backend/src/maintenance/work-orders.routes.ts",
  "apps/backend/src/maintenance/severe-repair-estimate.service.ts",
];

/** Strip SQL/JS comments — a comment documenting the phantom name is not a reference to it. */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * PURE. Given file text, return violations: a phantom column used as a QUALIFIED ref on a
 * work_order_lines alias, or an unqualified phantom in a work_order_lines statement.
 */
export function findPhantomUse(text) {
  const src = stripComments(text);
  const out = [];
  // Statements that touch work_order_lines, with the alias they bind (if any).
  const stmtRe = /maintenance\.work_order_lines(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi;
  let m;
  while ((m = stmtRe.exec(src))) {
    const alias = m[1] && !["where", "set", "using", "values", "on"].includes(m[1].toLowerCase()) ? m[1] : null;
    // Bound the window to THIS statement. A fixed-size slice spills into the next query — both WO
    // route files follow a work_order_lines read with a maintenance.wo_status_history read whose
    // work_order_id IS a real column, and an unbounded window flagged that as a phantom. Queries live
    // in template literals, so the closing backtick is the statement boundary; fall back to a bounded
    // slice if none is found.
    const rest = src.slice(m.index);
    const end = rest.indexOf("`");
    const window = rest.slice(0, end === -1 ? 1200 : end);
    for (const col of PHANTOM) {
      if (alias && new RegExp(`\\b${alias}\\.${col}\\b`).test(window)) out.push(`${alias}.${col}`);
      if (new RegExp(`\\b${col}\\s*=\\s*\\$\\d`).test(window)) out.push(col);
    }
    // `li.id` / `wl.id` on a work_order_lines alias — the PK is `uuid`, not `id`.
    if (alias && new RegExp(`\\b${alias}\\.id\\b`).test(window)) out.push(`${alias}.id`);
  }
  return [...new Set(out)];
}

function run() {
  const problems = [];
  for (const f of FILES) {
    const abs = resolve(process.cwd(), f);
    if (!existsSync(abs)) {
      problems.push(`${f} not found — if it moved, update this guard rather than deleting the check`);
      continue;
    }
    for (const v of findPhantomUse(readFileSync(abs, "utf8"))) {
      problems.push(`${f}: '${v}' — maintenance.work_order_lines has no such column (use uuid / work_order_uuid / total_cost)`);
    }
  }
  if (problems.length) {
    console.error(`[verify-wo-line-canonical-columns] FAILED — ${problems.length} phantom column reference(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(`[verify-wo-line-canonical-columns] OK — ${FILES.length} files use only real work_order_lines columns`);
  return true;
}

function selftest() {
  let ok = true;
  // Corrected shape must NOT be flagged.
  for (const f of FILES) {
    const abs = resolve(process.cwd(), f);
    if (existsSync(abs) && findPhantomUse(readFileSync(abs, "utf8")).length) {
      console.error(`SELFTEST FAIL: real (fixed) ${f} is flagged — false positive`);
      ok = false;
    }
  }
  if (ok) console.log("SELFTEST: corrected sources not flagged — OK");

  const cases = [
    ["qualified work_order_id", "FROM maintenance.work_order_lines wl WHERE wl.work_order_id = $1", true],
    ["qualified amount", "FROM maintenance.work_order_lines wl SELECT SUM(wl.amount)", true],
    ["alias .id (PK is uuid)", "DELETE FROM maintenance.work_order_lines li WHERE li.id = $1", true],
    ["unqualified work_order_id", "SELECT * FROM maintenance.work_order_lines WHERE work_order_id = $1", true],
    ["corrected form", "FROM maintenance.work_order_lines wl WHERE wl.work_order_uuid = $1 AND wl.total_cost > 0", false],
    ["comment naming the phantom", "-- was wl.amount joined on wl.work_order_id\nFROM maintenance.work_order_lines wl WHERE wl.uuid = $1", false],
  ];
  for (const [name, sql, shouldFlag] of cases) {
    const flagged = findPhantomUse(sql).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }
  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
