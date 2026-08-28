#!/usr/bin/env node
/**
 * verify-factoring-batch-writes-factoring-status.mjs
 * (FACTORING-BATCH-NEVER-WRITES-FACTORING-STATUS-NO-REVERSE-PATH, half 1 of 2)
 *
 * accounting.invoices.factoring_status carries a full CHECK-constrained lifecycle
 * (not_factored -> submitted -> advanced -> reserve_held -> collected/released/recourse_returned)
 * that apps/backend/src/factoring/faro-csv-import.ts's CSV ingest flow already writes to. Until
 * this fix, apps/backend/src/factoring/batch.service.ts's submitBatch/fundBatch never touched it
 * at all — an invoice pledged via the real BatchWizard UI still read factoring_status=not_factored
 * after submission, which meant submission-queue.service.ts's OWN, completely separate eligibility
 * gate (`COALESCE(factoring_status,'not_factored') = 'not_factored'`) could still offer the SAME
 * invoice up as eligible in a different flow — a real cross-flow double-pledge.
 *
 * FAIL if submitBatch doesn't advance factoring_status to 'submitted' (guarded from
 * 'not_factored' only), or fundBatch doesn't advance it to 'advanced' (guarded from 'submitted'
 * only) — an unguarded UPDATE could regress a further-along invoice (reserve_held/collected/etc.)
 * back down the lifecycle, which is its own kind of financial-record corruption.
 *
 * Does NOT check the reverse/void half of the original finding (half 2 of 2) — that half still
 * needs an owner decision on what a batch reversal should do to any already-posted reserve/GL
 * entries, per the finding's own Rule 13 note, and is intentionally out of scope here.
 *
 * Self-test: --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/factoring/batch.service.ts";
const LABEL = "verify-factoring-batch-writes-factoring-status";

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/** Body of `export async function <name>(...)` up to the next top-level export. */
function functionBody(src, name) {
  const start = src.search(new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`));
  if (start < 0) return "";
  const rest = src.slice(start + 8);
  const next = rest.search(/\nexport\s+(async\s+)?function\s/);
  return next < 0 ? rest : rest.slice(0, next);
}

export function check(sources) {
  const failures = [];
  const src = sources ? sources.batchService : (() => { try { return read(FILE); } catch { return null; } })();
  if (src == null) return [`${FILE} not found`];

  const submitBody = functionBody(src, "submitBatch");
  if (!submitBody) {
    failures.push(`${FILE}: submitBatch() not found`);
  } else {
    if (!/factoring_status\s*=\s*'submitted'/.test(submitBody)) {
      failures.push(`${FILE}: submitBatch() must set accounting.invoices.factoring_status = 'submitted' on the pledged invoices — otherwise submission-queue.service.ts's separate eligibility gate can still offer the same invoice up as eligible (cross-flow double-pledge)`);
    }
    if (/factoring_status\s*=\s*'submitted'/.test(submitBody) && !/COALESCE\(factoring_status,\s*'not_factored'\)\s*=\s*'not_factored'/.test(submitBody)) {
      failures.push(`${FILE}: submitBatch()'s factoring_status UPDATE must be guarded to only advance from 'not_factored' — an unguarded UPDATE could regress a further-along invoice (reserve_held/collected/released/recourse_returned) back to 'submitted'`);
    }
  }

  const fundBody = functionBody(src, "fundBatch");
  if (!fundBody) {
    failures.push(`${FILE}: fundBatch() not found`);
  } else {
    if (!/factoring_status\s*=\s*'advanced'/.test(fundBody)) {
      failures.push(`${FILE}: fundBatch() must set accounting.invoices.factoring_status = 'advanced' on the funded invoices, mirroring faro-csv-import.ts's own terminal value for cash actually having moved`);
    }
    if (/factoring_status\s*=\s*'advanced'/.test(fundBody) && !/COALESCE\(factoring_status,\s*'not_factored'\)\s*=\s*'submitted'/.test(fundBody)) {
      failures.push(`${FILE}: fundBatch()'s factoring_status UPDATE must be guarded to only advance from 'submitted' — an unguarded UPDATE could regress a further-along invoice back to 'advanced'`);
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const good = `
export async function submitBatch(batchId, tenantId, deps) {
  const updated = await deps.client.query(\`UPDATE factoring.batch SET status = 'submitted' WHERE id = $1 RETURNING *\`, [batchId]);
  await deps.client.query(\`UPDATE accounting.invoices SET factoring_status = 'submitted' WHERE id = ANY($2::uuid[]) AND COALESCE(factoring_status, 'not_factored') = 'not_factored'\`, [tenantId, updated.rows[0].invoice_ids]);
  return mapBatchRow(updated.rows[0]);
}

export async function fundBatch(batchId, actualFundedCents, tenantId, deps) {
  const updated = await deps.client.query(\`UPDATE factoring.batch SET status = 'funded' WHERE id = $1 RETURNING *\`, [batchId]);
  await deps.client.query(\`UPDATE accounting.invoices SET factoring_status = 'advanced' WHERE id = ANY($2::uuid[]) AND COALESCE(factoring_status, 'not_factored') = 'submitted'\`, [tenantId, updated.rows[0].invoice_ids]);
  return mapBatchRow(updated.rows[0]);
}
`;
  const missingSubmitWrite = good.replace(
    `await deps.client.query(\`UPDATE accounting.invoices SET factoring_status = 'submitted' WHERE id = ANY($2::uuid[]) AND COALESCE(factoring_status, 'not_factored') = 'not_factored'\`, [tenantId, updated.rows[0].invoice_ids]);\n  `,
    ""
  );
  // Strip only the not_factored guard clause from submitBatch's UPDATE, leaving the write itself
  // (and fundBatch's own guard clause, which contains the same "= 'not_factored'" substring in its
  // COALESCE default, untouched) — replaceAll would hit fundBatch's guard too, so this targets the
  // literal WHERE clause fragment unique to submitBatch's statement.
  const unguardedSubmitWrite = good.replace(
    "WHERE id = ANY($2::uuid[]) AND COALESCE(factoring_status, 'not_factored') = 'not_factored'",
    "WHERE id = ANY($2::uuid[])"
  );
  const missingFundWrite = good.replace(
    `await deps.client.query(\`UPDATE accounting.invoices SET factoring_status = 'advanced' WHERE id = ANY($2::uuid[]) AND COALESCE(factoring_status, 'not_factored') = 'submitted'\`, [tenantId, updated.rows[0].invoice_ids]);\n  `,
    ""
  );

  const checks = [
    ["fully wired source produces zero failures", check({ batchService: good }).length === 0],
    ["submitBatch missing the factoring_status write is caught", check({ batchService: missingSubmitWrite }).some((f) => f.includes("submitBatch() must set"))],
    ["submitBatch's write missing the not_factored guard is caught", missingSubmitWrite !== unguardedSubmitWrite && check({ batchService: unguardedSubmitWrite }).some((f) => f.includes("only advance from 'not_factored'"))],
    ["fundBatch missing the factoring_status write is caught", check({ batchService: missingFundWrite }).some((f) => f.includes("fundBatch() must set"))],
    ["real repo file currently satisfies this guard (no args = real file)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — submitBatch/fundBatch correctly advance accounting.invoices.factoring_status, guarded against regressing a further-along invoice`);
}
