#!/usr/bin/env node
/**
 * GUARD: a load rate change must re-sync its UNSENT (draft|proforma) invoice on BOTH writers,
 * and must NOT touch an issued one. ACCT-F270 / FAIL-I1 dual-path.
 *
 * Writers:
 *   1) dispatch updateDispatchLoad (apps/backend/src/dispatch/update-load.service.ts)
 *   2) mdata PATCH /api/v1/mdata/loads/:id (apps/backend/src/mdata/loads.routes.ts)
 *
 * Shared helper: apps/backend/src/accounting/resync-proforma-from-load-rate.ts
 * — both writers MUST call it; the SQL boundary lives ONLY in the helper so the dual-path
 * cannot drift.
 *
 * Boundary (safety):
 *   · draft + proforma → re-sync (unsent projections)
 *   · sent / partial / paid / factored → NEVER
 *   · voided_at IS NULL → never revive a dead document
 *
 * Run:  node scripts/verify-rate-change-resyncs-proforma.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = "apps/backend/src/accounting/resync-proforma-from-load-rate.ts";
const DISPATCH = "apps/backend/src/dispatch/update-load.service.ts";
const MDATA = "apps/backend/src/mdata/loads.routes.ts";
const LABEL = "verify-rate-change-resyncs-proforma";
const CALL = "resyncProformaInvoiceFromLoadRate";

export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/** Isolate the statement that updates invoice_lines, so unrelated SQL cannot satisfy the checks. */
export function resyncStatement(src) {
  const clean = stripComments(src);
  const m = /UPDATE\s+accounting\.invoice_lines[\s\S]{0,1200}?(?:RETURNING[^`;]*|;|`)/i.exec(clean);
  return m ? m[0] : null;
}

function hasUnsentStatusGate(stmt) {
  // Accept IN ('draft','proforma') or equality on proforma (legacy). Reject unrestricted.
  return (
    /status\s+IN\s*\(\s*['"]draft['"]\s*,\s*['"]proforma['"]\s*\)/i.test(stmt) ||
    /status\s+IN\s*\(\s*['"]proforma['"]\s*,\s*['"]draft['"]\s*\)/i.test(stmt) ||
    /status\s*=\s*['"]proforma['"]/i.test(stmt)
  );
}

export function collectHelperProblems(src) {
  const problems = [];
  const stmt = resyncStatement(src);
  if (!stmt) {
    problems.push(
      `${HELPER}: missing UPDATE accounting.invoice_lines — shared FAIL-I1 wire is empty.`
    );
    return problems;
  }
  if (!hasUnsentStatusGate(stmt)) {
    problems.push(
      `${HELPER}: invoice re-sync is not restricted to unsent draft|proforma. Rewriting a sent/` +
        `partial/paid invoice changes a document the customer has already acted on (ACCT-F270).`
    );
  }
  if (!/voided_at\s+IS\s+NULL/i.test(stmt)) {
    problems.push(
      `${HELPER}: invoice re-sync does not exclude voided invoices — a dead document could be revived.`
    );
  }
  if (/['"]sent['"]|['"]partial['"]|['"]paid['"]|['"]factored['"]/i.test(stmt) && !hasUnsentStatusGate(stmt)) {
    problems.push(`${HELPER}: issued invoice statuses appear without an unsent gate.`);
  }
  return problems;
}

export function collectWriterProblems(relPath, src) {
  const clean = stripComments(src);
  const problems = [];
  if (!new RegExp(`\\b${CALL}\\b`).test(clean)) {
    problems.push(
      `${relPath}: does not call ${CALL} — dual-path hole: rate can change without refreshing the ` +
        `draft/proforma from-load invoice (FAIL-I1).`
    );
  }
  // Writers must not keep a parallel inline UPDATE (drift).
  if (/UPDATE\s+accounting\.invoice_lines/i.test(clean)) {
    problems.push(
      `${relPath}: still has inline UPDATE accounting.invoice_lines — move SQL exclusively into ${HELPER}.`
    );
  }
  return problems;
}

export function collectProblems(files) {
  const problems = [];
  problems.push(...collectHelperProblems(files.helper));
  problems.push(...collectWriterProblems(DISPATCH, files.dispatch));
  problems.push(...collectWriterProblems(MDATA, files.mdata));
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD_HELPER = `
export async function resyncProformaInvoiceFromLoadRate(c, i) {
  await c.query(\`UPDATE accounting.invoice_lines l SET line_total_cents = $3
    FROM accounting.invoices i WHERE i.source_load_id = $1
    AND i.status IN ('draft', 'proforma') AND i.voided_at IS NULL RETURNING i.id\`);
}
`;
  const BAD_HELPER_NO_GATE = `
export async function resyncProformaInvoiceFromLoadRate(c, i) {
  await c.query(\`UPDATE accounting.invoice_lines l SET line_total_cents = $3
    FROM accounting.invoices i WHERE i.source_load_id = $1 AND i.voided_at IS NULL RETURNING i.id\`);
}
`;
  const BAD_HELPER_NO_VOID = `
export async function resyncProformaInvoiceFromLoadRate(c, i) {
  await c.query(\`UPDATE accounting.invoice_lines l SET line_total_cents = $3
    FROM accounting.invoices i WHERE i.source_load_id = $1 AND i.status IN ('draft', 'proforma') RETURNING i.id\`);
}
`;
  const GOOD_WRITER = `import { resyncProformaInvoiceFromLoadRate } from "../accounting/resync-proforma-from-load-rate.js";
await resyncProformaInvoiceFromLoadRate(client, { loadId, operatingCompanyId, newRateTotalCents });`;
  const MISSING_WRITER = `await appendCrudAudit(c, u, "mdata.loads.updated", {});`;
  const INLINE_WRITER = GOOD_WRITER + "\nawait c.query(`UPDATE accounting.invoice_lines SET x=1`);";

  if (collectHelperProblems(GOOD_HELPER).length !== 0) failures.push("good helper flagged");
  if (!collectHelperProblems(BAD_HELPER_NO_GATE).some((p) => /not restricted to unsent/.test(p))) {
    failures.push("unrestricted helper not caught");
  }
  if (!collectHelperProblems(BAD_HELPER_NO_VOID).some((p) => /voided/.test(p))) {
    failures.push("void-revival helper not caught");
  }
  if (collectWriterProblems(DISPATCH, GOOD_WRITER).length !== 0) failures.push("good writer flagged");
  if (!collectWriterProblems(MDATA, MISSING_WRITER).some((p) => /does not call/.test(p))) {
    failures.push("missing mdata call not caught");
  }
  if (!collectWriterProblems(DISPATCH, INLINE_WRITER).some((p) => /inline UPDATE/.test(p))) {
    failures.push("inline UPDATE drift not caught");
  }
  const COMMENT_FAKE =
    MISSING_WRITER + "\n// resyncProformaInvoiceFromLoadRate(client, {})";
  if (!collectWriterProblems(MDATA, COMMENT_FAKE).some((p) => /does not call/.test(p))) {
    failures.push("comment faked the call — false green");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — dual-path: helper gate + both writers call shared helper; no inline drift`
  );
  process.exit(0);
}

function readRel(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`${LABEL} FAIL — ${rel} is missing.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}

const problems = collectProblems({
  helper: readRel(HELPER),
  dispatch: readRel(DISPATCH),
  mdata: readRel(MDATA),
});
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} rate-resync gap(s):`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(
  `${LABEL} OK — both writers call ${CALL}; helper re-syncs draft|proforma only and never voids-revival.`
);
