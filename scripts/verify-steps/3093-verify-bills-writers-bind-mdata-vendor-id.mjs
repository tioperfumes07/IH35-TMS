#!/usr/bin/env node
/**
 * LV-BILL-MDATA-VENDOR-FK-OPTOUT sweep — `accounting.bills.mdata_vendor_id` is the ONE column that
 * makes a bill referencing another entity's vendor structurally impossible (the composite FK
 * `bills_mdata_vendor_entity_consistent_fkey`). `createBill()` (bills.service.ts) already fails
 * closed on it (ACCT-F158/ACCT-F603). Tracing the board's `LV-BILL-MDATA-VENDOR-FK-OPTOUT` row live
 * found SIX OTHER `INSERT INTO accounting.bills` sites across the codebase that never referenced the
 * column at all — every TMS-native bill those 6 create was structurally opted OUT of the one control
 * that makes a cross-entity vendor link impossible, by omission, not by a null-check gap.
 *
 * FIX: each of the 6 writers now resolves the FK — five via the shared, non-throwing
 * `resolveMdataVendorIdBestEffort()` (bills.service.ts), one (`two-section-service.ts`) via an
 * equivalent entity-scoped subquery since it's a pure SQL INSERT ... SELECT with no JS-side resolve
 * step, and one (`policy-create-atomic.service.ts`) reuses a vendor id it had already resolved
 * earlier in the same function.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): each of the 6 files
 * still contains BOTH an `INSERT INTO accounting.bills` and a reference to `mdata_vendor_id` in the
 * same statement's column list. This does not re-verify the SQL is correct (that's the .db.test.ts
 * suite's job) — it only guards against the exact regression this sweep fixed: a column silently
 * dropped back out of the INSERT.
 *
 * Self-test: node scripts/verify-steps/3093-verify-bills-writers-bind-mdata-vendor-id.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "3093-verify-bills-writers-bind-mdata-vendor-id";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

const WRITERS = [
  path.join("apps", "backend", "src", "accounting", "recurring.worker.ts"),
  path.join("apps", "backend", "src", "accounting", "maintenance-posting", "poster.service.ts"),
  path.join("apps", "backend", "src", "banking", "bulk-transactions.ts"),
  path.join("apps", "backend", "src", "banking", "bank-transaction-splits.service.ts"),
  path.join("apps", "backend", "src", "maintenance", "two-section-service.ts"),
  path.join("apps", "backend", "src", "insurance", "policy-create-atomic.service.ts"),
];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Isolate ONE `INSERT INTO accounting.bills ( ... )` statement's column-list — from the opening
 * paren after `accounting.bills` to its matching close paren — so the check cannot be satisfied by
 * `mdata_vendor_id` appearing anywhere else in the file (a comment, an unrelated query).
 */
export function findBillsInsertColumnLists(src) {
  const code = stripComments(src);
  const lists = [];
  const anchor = /INSERT INTO accounting\.bills\s*\(/g;
  let m;
  while ((m = anchor.exec(code))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < code.length && depth > 0) {
      if (code[i] === "(") depth += 1;
      else if (code[i] === ")") depth -= 1;
      i += 1;
    }
    lists.push(code.slice(start, i - 1));
  }
  return lists;
}

export function checkWriter(src) {
  const lists = findBillsInsertColumnLists(src);
  if (lists.length === 0) return { ok: false, reason: "no INSERT INTO accounting.bills found" };
  const missing = lists.filter((l) => !/mdata_vendor_id/.test(l));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${missing.length} of ${lists.length} accounting.bills INSERT(s) missing mdata_vendor_id in the column list`,
    };
  }
  return { ok: true };
}

if (process.argv.includes("--selftest")) {
  const good = `await client.query(\`INSERT INTO accounting.bills (operating_company_id, vendor_id, mdata_vendor_id, amount_cents) VALUES ($1,$2,$3,$4)\`)`;
  const bad = `await client.query(\`INSERT INTO accounting.bills (operating_company_id, vendor_id, amount_cents) VALUES ($1,$2,$3)\`)`;
  const commentTrap = `// INSERT INTO accounting.bills (operating_company_id, mdata_vendor_id) fake\nawait client.query(\`INSERT INTO accounting.bills (operating_company_id, vendor_id, amount_cents) VALUES ($1,$2,$3)\`)`;

  const g = checkWriter(good);
  if (!g.ok) fail(`selftest: good fixture flagged — ${g.reason}`);
  const b = checkWriter(bad);
  if (b.ok) fail("selftest: bad fixture (mdata_vendor_id stripped) was not caught — invariant is inert");
  const c = checkWriter(commentTrap);
  if (c.ok) fail("selftest: a mention of mdata_vendor_id in a COMMENT satisfied the check — comment-matching trap (see 3065 precedent)");

  // Real-file regression check: each of the 6 live writers must currently pass.
  for (const w of WRITERS) {
    const src = fs.readFileSync(path.join(ROOT, w), "utf8");
    const r = checkWriter(src);
    if (!r.ok) fail(`selftest baseline: real writer ${w} should pass but does not — ${r.reason}`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/bad/comment-trap fixtures classify correctly; all 6 real writers pass`);
  process.exit(0);
}

const failures = [];
for (const w of WRITERS) {
  const p = path.join(ROOT, w);
  if (!fs.existsSync(p)) {
    failures.push(`${w}: file not found`);
    continue;
  }
  const src = fs.readFileSync(p, "utf8");
  const r = checkWriter(src);
  if (!r.ok) failures.push(`${w}: ${r.reason}`);
}

if (failures.length) {
  console.error(`[${LABEL}] FAIL — ${failures.length} of ${WRITERS.length} bill writer(s) regressed:`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — all ${WRITERS.length} accounting.bills writers (beyond createBill) bind mdata_vendor_id`);
