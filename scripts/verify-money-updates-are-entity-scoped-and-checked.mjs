#!/usr/bin/env node
// B9 (Devin sweep, 2026-09-28) -- accounting/bills.service.ts's bill-payment-void path had
//   UPDATE accounting.bills SET paid_cents = $2, ... WHERE id = $1
// with no operating_company_id predicate and no rowCount check. Safe only because the row was
// already locked FOR UPDATE, scoped by (id, operating_company_id), earlier in the same function --
// a real but fragile guarantee a future refactor could silently drop. Fixed: the UPDATE now repeats
// the operating_company_id predicate and asserts rowCount === 1.
//
// SCOPE, AND WHY IT IS NARROW: a first pass tried to generalize this into a codebase-wide sweep for
// "any accounting./driver_finance./banking. UPDATE missing an entity predicate or a rowCount check".
// Even after tightening to "both protections missing at once" (the real B9 shape, not either alone),
// that swept up 161 hits across the backend. Reviewing each by hand to tell a real defect from a
// pattern this guard's own regex heuristic simply can't recognize (scoped by an id already locked
// FOR UPDATE earlier in the same function and never repeated in the UPDATE's own WHERE text; checked
// via a variable name or a distance this guard's window doesn't reach) is a real, separate audit --
// not something this fix can respons; irresponsibly verify at scale in the time this task had. Rather
// than ship a guard that is red on 161 lines nobody has individually confirmed are real (the
// "guard that reddens on expected state" anti-pattern this codebase's own law forbids), this guard
// is a precise, named regression test for the ONE finding that was actually investigated and fixed:
// it re-derives the exact UPDATE block in bills.service.ts and asserts it still carries both
// protections. The 161-hit sweep is named here, not silently discarded, as real follow-up audit
// work for a dedicated task.
//
// --selftest re-checks the same two conditions against a synthetic copy of the fixed block, and
// against a mutated copy missing each protection in turn.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-updates-are-entity-scoped-and-checked";
const TARGET_FILE = path.join(ROOT, "apps/backend/src/accounting/bills.service.ts");

/** Find EVERY `UPDATE accounting.bills SET paid_cents = ...` block -- there are two real,
 * independently-fixed call sites in this file (the payment-create path and the payment-void path,
 * both discovered while investigating B9), plus a wide trailing window per block for the rowCount
 * check that follows it in source. */
function findFixedBlocks(src) {
  // Bound-parameter form only (paid_cents = $2, ...) -- the two B9 fixes both compute a real new
  // balance and bind it. A third, unrelated, pre-existing site in this same file
  // (accounting.bill.voided) resets paid_cents to the literal 0 and is already correctly protected
  // via RETURNING + a rows[0] check, a different, equally valid idiom this narrowly-scoped guard
  // does not need to also recognize -- excluding it by requiring a bound parameter keeps this guard
  // targeted at exactly the two sites B9 actually touched.
  const re = /UPDATE\s+accounting\.bills\s+SET\s+paid_cents\s*=\s*\$\d+[\s\S]{0,600}?(?:;|`)/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const blockEnd = m.index + m[0].length;
    out.push({ block: m[0], trailingWindow: src.slice(blockEnd, blockEnd + 300) });
  }
  return out;
}

function checkBlock(found, index) {
  const failures = [];
  const where = found.block.toUpperCase().includes("WHERE") ? found.block.slice(found.block.toUpperCase().indexOf("WHERE")) : "";
  if (!/operating_company_id/i.test(where)) {
    failures.push(`B9 REGRESSION: bills.service.ts paid_cents UPDATE #${index + 1} no longer has operating_company_id in its own WHERE clause.`);
  }
  if (!/rowCount/i.test(found.trailingWindow)) {
    failures.push(`B9 REGRESSION: bills.service.ts paid_cents UPDATE #${index + 1} is no longer followed by a rowCount check.`);
  }
  return failures;
}

function checkAllBlocks(src) {
  const blocks = findFixedBlocks(src);
  if (blocks.length < 2) {
    return [`Expected 2 independently-fixed "UPDATE accounting.bills SET paid_cents" blocks in bills.service.ts, found ${blocks.length} -- has one been renamed, removed, or merged? If the B9 fix moved or one site was legitimately consolidated, update this guard's expectation, do not just let it go vacuous.`];
  }
  return blocks.flatMap((b, i) => checkBlock(b, i));
}

function run() {
  const src = fs.readFileSync(TARGET_FILE, "utf8");
  const failures = checkAllBlocks(src);
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS -- bills.service.ts's paid_cents UPDATE still carries both protections (operating_company_id predicate + rowCount check).`);
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const realSrc = fs.readFileSync(TARGET_FILE, "utf8");
  assert.equal(checkAllBlocks(realSrc).length, 0, "real source must be clean");

  const twoFixed = [
    "await client.query(`UPDATE accounting.bills SET paid_cents = $2 WHERE id = $1 AND operating_company_id = $3::uuid`, [id, cents, opco]);\nif (res.rowCount !== 1) throw new Error('x');\n",
    "await client.query(`UPDATE accounting.bills SET paid_cents = $2 WHERE id = $1 AND operating_company_id = $5::uuid`, [id, cents, s, s2, opco]);\nif (r2.rowCount !== 1) throw new Error('y');\n",
  ].join("\n");
  assert.equal(checkAllBlocks(twoFixed).length, 0, "two correctly-scoped-and-checked synthetic blocks must pass");

  const missingScope = [
    "await client.query(`UPDATE accounting.bills SET paid_cents = $2 WHERE id = $1`, [id, cents]);\nif (res.rowCount !== 1) throw new Error('x');\n",
    "await client.query(`UPDATE accounting.bills SET paid_cents = $2 WHERE id = $1 AND operating_company_id = $5::uuid`, [id, cents, s, s2, opco]);\nif (r2.rowCount !== 1) throw new Error('y');\n",
  ].join("\n");
  assert.ok(checkAllBlocks(missingScope).length > 0, "MUTATION (missing operating_company_id on one block) escaped detection");

  // Padded far apart so the two blocks' trailing windows (300 chars) cannot bleed into each other --
  // otherwise block 1's window could pick up block 2's real "rowCount" text and mask the mutation.
  const filler = "// padding\n".repeat(40);
  const missingCheck = [
    "await client.query(`UPDATE accounting.bills SET paid_cents = $2 WHERE id = $1 AND operating_company_id = $3::uuid`, [id, cents, opco]);\nreturn true;\n",
    filler,
    "await client.query(`UPDATE accounting.bills SET paid_cents = $2 WHERE id = $1 AND operating_company_id = $5::uuid`, [id, cents, s, s2, opco]);\nif (r2.rowCount !== 1) throw new Error('y');\n",
  ].join("\n");
  assert.ok(checkAllBlocks(missingCheck).length > 0, "MUTATION (missing rowCount check on one block) escaped detection");

  const goneVacuous = "// no such block here anymore\n";
  assert.ok(checkAllBlocks(goneVacuous).length > 0, "MUTATION (blocks disappeared entirely) must fail loud, not go vacuous");

  console.log(`${LABEL} --selftest PASS (3/3 mutations caught, real source clean, 2 tracked blocks confirmed present)`);
  process.exit(0);
}

run();
