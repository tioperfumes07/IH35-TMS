#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["loads_bulk","connectivity"],"leaves":["dispatch.loads_bulk.mark_factored.zero_rows_check"],"task":"DSP-MONEY-F7155A-BULK-MARK-FACTORED-UNCHECKED-WRITE","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7155A-BULK-MARK-FACTORED-UNCHECKED-WRITE (GO-0027 drain, CC-1, 2026-08-28): the
 * dispatch bulk `mark_factored` action reads the latest company-scoped invoice, confirms
 * `not_factored`, then runs `UPDATE accounting.invoices ... RETURNING *` with no check that a row
 * was actually returned. A concurrent lifecycle change or lost invoice row between the read and
 * the UPDATE could reach `appendBulkCrudAudit` and report per-entity success using `undefined` as
 * the post-write snapshot. Its own sibling action, `mark_paid`, already has exactly this check
 * (`if (updateRes.rows.length === 0) return { ok: false, code: "E_UPDATE_FAILED", ... }`).
 * Root-caused live: apps/backend/src/dispatch/loads-bulk.routes.ts's `mark_factored` branch. Fixed
 * by adding the identical zero-row check before building audit changes. This guard holds that fix
 * so it cannot regress.
 *
 * Self-test: node scripts/verify-bulk-mark-factored-zero-rows-check.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/dispatch/loads-bulk.routes.ts",
};
const LABEL = "verify-bulk-mark-factored-zero-rows-check";

export function audit(src) {
  const failures = [];
  const branchMatch = src.routes.match(
    /\} else if \(action === "mark_factored"\) \{[\s\S]*?\n  \} else if \(action === "mark_paid"\)/,
  );
  if (!branchMatch) {
    failures.push(`${FILES.routes}: mark_factored branch not found`);
    return failures;
  }
  const body = branchMatch[0];
  if (!/if \(updateRes\.rows\.length === 0\) \{\s*\n\s*return \{ ok: false, code: "E_UPDATE_FAILED", message: "Load mark factored failed" \};/.test(body)) {
    failures.push(
      `${FILES.routes}: mark_factored's UPDATE must be followed by a zero-row check that returns ` +
        `E_UPDATE_FAILED — otherwise a lost/changed invoice row can reach appendBulkCrudAudit with ` +
        `an undefined post-write snapshot and report success anyway`,
    );
  }
  // Order matters: the check must run BEFORE buildPatchChanges consumes updateRes.rows[0].
  const checkIdx = body.indexOf('return { ok: false, code: "E_UPDATE_FAILED", message: "Load mark factored failed" };');
  const buildIdx = body.indexOf("auditPayload.changes = buildPatchChanges(");
  if (checkIdx === -1 || buildIdx === -1 || checkIdx > buildIdx) {
    failures.push(
      `${FILES.routes}: the zero-row check must run BEFORE buildPatchChanges reads updateRes.rows[0]`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    routes: fs.readFileSync(path.join(root, FILES.routes), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutated = {
    routes: good.routes.replace(
      `    // DSP-MONEY-F7155A (GO-0027, CC-1): a concurrent lifecycle change or lost invoice row between
    // the read above and this UPDATE must not reach appendBulkCrudAudit with an undefined post-write
    // snapshot and report success anyway — mirrors mark_paid's own zero-row check below.
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Load mark factored failed" };
    }
`,
      "",
    ),
  };
  if (mutated.routes === good.routes) {
    console.error(`${LABEL} SELFTEST FAIL — check-removal pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — check removal escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 1 mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — bulk mark_factored fails closed on a zero-row invoice update`);
