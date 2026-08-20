#!/usr/bin/env node
/**
 * ACCT-F5650 — `applyInvoiceAndReserveUpdates` (`factoring/faro-csv-import.ts`) called
 * `postReserveMovement` unconditionally for every CSV line with a positive reserve amount,
 * regardless of whether the invoice UPDATE just above it actually matched a row. Re-uploading the
 * same Faro CSV file (a natural retry after any downstream failure in the same import, or an honest
 * duplicate upload) silently re-credited the reserve for every already-advanced line a second time --
 * postReserveMovement is a pure append-only INSERT with no idempotency check of its own, and
 * factoring.reserve_movement has no unique constraint to catch the duplicate at the DB layer either.
 *
 * FAIL if postReserveMovement can be called without first gating on the invoice UPDATE's own
 * row-count AND checking for an existing reserve_movement row with the same reason key. PASS when
 * both guards are present and precede the insert.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-faro-csv-reserve-movement-idempotent-retry";
const FILE = path.join(ROOT, "apps/backend/src/factoring/faro-csv-import.ts");

export function analyzeFaroCsvSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const fnMatch = code.match(/async function applyInvoiceAndReserveUpdates\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push(`${path.relative(ROOT, FILE)}: could not locate applyInvoiceAndReserveUpdates function body`);
    return failures;
  }
  const fn = fnMatch[0];

  if (!/const wasNewlyAdvanced = Boolean\(invoiceRes\.rows\[0\]\)/.test(fn)) {
    failures.push(`${path.relative(ROOT, FILE)}: must capture wasNewlyAdvanced from the invoice UPDATE's own row-count`);
  }

  const guardMatch = fn.match(/if \(([^)]*)\)\s*\{[\s\S]*?postReserveMovement\(/);
  if (!guardMatch) {
    failures.push(`${path.relative(ROOT, FILE)}: postReserveMovement must be called inside an if-guard`);
  } else {
    const guard = guardMatch[1];
    if (!/wasNewlyAdvanced/.test(guard)) {
      failures.push(`${path.relative(ROOT, FILE)}: postReserveMovement's call-site guard must require wasNewlyAdvanced (do not credit the reserve on a retry that didn't actually re-advance the invoice)`);
    }
  }

  // The existence check must run BEFORE postReserveMovement and gate it.
  const dupIdx = fn.indexOf("SELECT 1 FROM factoring.reserve_movement");
  const postIdx = fn.indexOf("await postReserveMovement(");
  if (dupIdx < 0) {
    failures.push(`${path.relative(ROOT, FILE)}: must query factoring.reserve_movement for an existing row with the same reason key before inserting a new one`);
  } else if (postIdx < 0 || postIdx < dupIdx) {
    failures.push(`${path.relative(ROOT, FILE)}: the reserve_movement existence check must run BEFORE the postReserveMovement insert`);
  } else {
    const between = fn.slice(dupIdx, postIdx);
    if (!/if \(!dup\.rows\[0\]\)/.test(between)) {
      failures.push(`${path.relative(ROOT, FILE)}: postReserveMovement must be gated on the existence-check finding no prior row (if (!dup.rows[0]))`);
    }
  }

  return failures;
}

export function run() {
  const src = fs.readFileSync(FILE, "utf8");
  return analyzeFaroCsvSource(src);
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
async function applyInvoiceAndReserveUpdates(client, companyId, lines, factorId, postingEnabled) {
  for (const line of lines) {
    const invoiceRes = await client.query(
      \`UPDATE accounting.invoices SET factoring_status = 'advanced' WHERE ... RETURNING id::text\`,
      [companyId, line.invoice_number]
    );
    const wasNewlyAdvanced = Boolean(invoiceRes.rows[0]);
    if (wasNewlyAdvanced) invoices_updated += 1;

    if (wasNewlyAdvanced && line.reserve_amount_cents > 0 && postingEnabled) {
      const reasonKey = \`faro_csv:\${line.invoice_number}\`;
      const dup = await client.query(
        \`SELECT 1 FROM factoring.reserve_movement WHERE operating_company_id = $1::uuid AND reason = $2::text LIMIT 1\`,
        [companyId, reasonKey]
      );
      if (!dup.rows[0]) {
        await postReserveMovement(null, companyId, "credit", line.reserve_amount_cents, reasonKey, { client, factorId });
        reserve_movements += 1;
      }
    }
  }
  return { invoices_updated, reserve_movements };
}
`;
  const goodFailures = analyzeFaroCsvSource(GOOD);
  if (goodFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${goodFailures.join("; ")}`);
  }

  const BAD_UNCONDITIONAL = `
async function applyInvoiceAndReserveUpdates(client, companyId, lines, factorId, postingEnabled) {
  for (const line of lines) {
    const invoiceRes = await client.query(
      \`UPDATE accounting.invoices SET factoring_status = 'advanced' WHERE ... RETURNING id::text\`,
      [companyId, line.invoice_number]
    );
    if (invoiceRes.rows[0]) invoices_updated += 1;

    if (line.reserve_amount_cents > 0 && postingEnabled) {
      await postReserveMovement(null, companyId, "credit", line.reserve_amount_cents, \`faro_csv:\${line.invoice_number}\`, { client, factorId });
      reserve_movements += 1;
    }
  }
  return { invoices_updated, reserve_movements };
}
`;
  if (!analyzeFaroCsvSource(BAD_UNCONDITIONAL).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (unconditional postReserveMovement, no gate, no dedup) should FAIL but passed`);
  }

  const BAD_GATED_BUT_NO_DEDUP = `
async function applyInvoiceAndReserveUpdates(client, companyId, lines, factorId, postingEnabled) {
  for (const line of lines) {
    const invoiceRes = await client.query(
      \`UPDATE accounting.invoices SET factoring_status = 'advanced' WHERE ... RETURNING id::text\`,
      [companyId, line.invoice_number]
    );
    const wasNewlyAdvanced = Boolean(invoiceRes.rows[0]);
    if (wasNewlyAdvanced) invoices_updated += 1;

    if (wasNewlyAdvanced && line.reserve_amount_cents > 0 && postingEnabled) {
      await postReserveMovement(null, companyId, "credit", line.reserve_amount_cents, \`faro_csv:\${line.invoice_number}\`, { client, factorId });
      reserve_movements += 1;
    }
  }
  return { invoices_updated, reserve_movements };
}
`;
  if (!analyzeFaroCsvSource(BAD_GATED_BUT_NO_DEDUP).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (gated on wasNewlyAdvanced but no dedup existence check) should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — postReserveMovement is gated on the invoice UPDATE actually matching AND a pre-insert existence check, so re-importing the same Faro CSV cannot double-credit the reserve`);
