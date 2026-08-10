#!/usr/bin/env node
/**
 * LV-INV-UUID — from-load invoice line description must use load_number, never load UUID.
 *
 * LIVE (USMCA, Neon 2026-08-10): multiple INV-2026-00025…00032 lines read
 * `Linehaul · Load <uuid>` while the invoice header correctly shows L-…. Customer PDF/send
 * carries that text.
 *
 * Root: apps/backend/src/accounting/from-load.ts interpolated `load.id` into description.
 * Manual invoice UI already used load_number (InvoiceTypeModalBase).
 *
 *   node scripts/verify-invoice-line-load-number-not-uuid.mjs
 *   node scripts/verify-invoice-line-load-number-not-uuid.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-invoice-line-load-number-not-uuid";
const TARGET = "apps/backend/src/accounting/from-load.ts";

const UUID_IN_LINEHAUL = /Linehaul\s*·\s*Load\s*\$\{[^}]*\bload\.id\b/;
const LOAD_NUMBER_SELECT = /l\.load_number/;
const LOAD_NUMBER_DESC = /Linehaul\s*·\s*Load\s*\$\{[^}]*loadNumber/;

export function audit(src) {
  const problems = [];
  if (!LOAD_NUMBER_SELECT.test(src)) {
    problems.push(`${TARGET}: SELECT from mdata.loads must include l.load_number`);
  }
  if (UUID_IN_LINEHAUL.test(src)) {
    problems.push(
      `${TARGET}: linehaul description still interpolates load.id — customer-facing UUID (LV-INV-UUID)`
    );
  }
  if (!LOAD_NUMBER_DESC.test(src) && !/linehaulDescription/.test(src)) {
    problems.push(
      `${TARGET}: linehaul description must be built from loadNumber / linehaulDescription (not a raw uuid)`
    );
  }
  if (!/load_number_required_for_invoice_line/.test(src)) {
    problems.push(
      `${TARGET}: must refuse minting a linehaul description when load_number is missing (no uuid fallback)`
    );
  }
  return problems;
}

function selftest() {
  const failures = [];
  const good = `
    SELECT l.id, l.load_number, l.customer_id FROM mdata.loads l
    const loadNumber = String(load.load_number ?? "").trim();
    if (!loadNumber) {
      throw Object.assign(new Error("load_number_required_for_invoice_line"), {
        code: "load_number_required_for_invoice_line",
      });
    }
    const linehaulDescription = \`Linehaul · Load \${loadNumber}\`;
  `;
  if (audit(good).length !== 0) {
    failures.push(`selftest: good fixture flagged: ${audit(good).join(" | ")}`);
  }

  const badUuid = `
    SELECT l.id, l.customer_id FROM mdata.loads l
    \`Linehaul · Load \${String(load.id)}\`
  `;
  const badProblems = audit(badUuid);
  if (!badProblems.some((p) => p.includes("load.id"))) {
    failures.push("selftest: load.id interpolation NOT detected");
  }
  if (!badProblems.some((p) => p.includes("l.load_number"))) {
    failures.push("selftest: missing l.load_number NOT detected");
  }

  const real = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (real.length !== 0) {
    failures.push(`selftest: real tree regressions: ${real.join(" | ")}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — from-load linehaul description uses load_number`);
}

main();
