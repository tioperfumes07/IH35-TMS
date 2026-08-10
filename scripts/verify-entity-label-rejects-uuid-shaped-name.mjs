#!/usr/bin/env node
/**
 * CLS-UUID-LABEL / LV-BILLS-VENDOR-UUID — entityLabel must not treat a UUID string as a display name.
 *
 * When list APIs fall back to `vendor_name: vendor_id`, FE used to paint the raw UUID in the Bills
 * Vendor column (`bill.vendor_name || bill.vendor_id`). entityLabel is the shared helper; rejecting
 * uuid-shaped "names" closes the class at the choke point.
 *
 *   node scripts/verify-entity-label-rejects-uuid-shaped-name.mjs
 *   node scripts/verify-entity-label-rejects-uuid-shaped-name.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-entity-label-rejects-uuid-shaped-name";
const TARGET = "apps/frontend/src/lib/entity-label.ts";
const BILLS = "apps/frontend/src/pages/accounting/BillsPage.tsx";

export function auditEntityLabel(src) {
  const problems = [];
  if (!/UUID_SHAPE_RE/.test(src)) {
    problems.push(`${TARGET}: must define UUID_SHAPE_RE for uuid-shaped name rejection`);
  }
  if (!/!UUID_SHAPE_RE\.test\(s\)/.test(src)) {
    problems.push(`${TARGET}: entityLabel must reject uuid-shaped name strings (!UUID_SHAPE_RE.test(s))`);
  }
  return problems;
}

export function auditBillsPage(src) {
  const problems = [];
  if (/label=\{bill\.vendor_name\s*\|\|\s*bill\.vendor_id\}/.test(src)) {
    problems.push(
      `${BILLS}: Vendor column still uses bill.vendor_name || bill.vendor_id — paints UUID when name===id`
    );
  }
  if (!/entityLabel\(\s*bill\.vendor_name\s*,\s*bill\.vendor_id\s*,\s*"Vendor"\s*\)/.test(src)) {
    problems.push(`${BILLS}: Vendor EntityLink label must use entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")`);
  }
  return problems;
}

function selftest() {
  const failures = [];
  const goodLabel = `
    const UUID_SHAPE_RE = /^[0-9a-f]{8}-/i;
    if (s !== "" && !UUID_SHAPE_RE.test(s)) return s;
  `;
  if (auditEntityLabel(goodLabel).length !== 0) {
    failures.push(`selftest: good entity-label flagged: ${auditEntityLabel(goodLabel).join(" | ")}`);
  }
  const badLabel = `if (s !== "") return s;`;
  if (auditEntityLabel(badLabel).length < 2) {
    failures.push("selftest: missing UUID reject NOT fully detected");
  }
  const goodBills = `<EntityLink kind="vendor" id={billVendorDrillId(bill)} label={entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")} />`;
  if (auditBillsPage(goodBills).length !== 0) {
    failures.push(`selftest: good BillsPage flagged: ${auditBillsPage(goodBills).join(" | ")}`);
  }
  const badBills = `<EntityLink kind="vendor" id={billVendorDrillId(bill)} label={bill.vendor_name || bill.vendor_id} />`;
  if (!auditBillsPage(badBills).some((p) => p.includes("vendor_name ||"))) {
    failures.push("selftest: BillsPage uuid fallback NOT detected");
  }

  const real = [
    ...auditEntityLabel(readFileSync(join(ROOT, TARGET), "utf8")),
    ...auditBillsPage(readFileSync(join(ROOT, BILLS), "utf8")),
  ];
  if (real.length) failures.push(`selftest: real tree: ${real.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = [
    ...auditEntityLabel(readFileSync(join(ROOT, TARGET), "utf8")),
    ...auditBillsPage(readFileSync(join(ROOT, BILLS), "utf8")),
  ];
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — entityLabel rejects uuid-shaped names; Bills Vendor uses entityLabel`);
}

main();
