#!/usr/bin/env node
/**
 * CLS-UUID-LABEL / LV-BILLS-VENDOR-UUID — entityLabel must not treat a UUID string as a display name.
 *
 * When list APIs fall back to `vendor_name: vendor_id`, FE used to paint the raw UUID in the Bills
 * Vendor column (`bill.vendor_name || bill.vendor_id`). entityLabel is the shared helper; rejecting
 * uuid-shaped "names" closes the class at the choke point. Batch-2 drains sibling name||id sites.
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

/** Batch-2 drain sites — name||id paints (CLS-UUID-LABEL). */
const SIBLINGS = [
  {
    rel: "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx",
    bad: /driver_name\?\.trim\(\)\s*\|\|\s*row\.driver_id/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx",
    bad: /primary_driver_name\s*\|\|\s*row\.primary_driver_id/,
    good: /entityLabel\(\s*row\.primary_driver_name\s*,\s*row\.primary_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    bad: /lender_vendor_name\s*\|\|\s*row\.lender_vendor_id/,
    good: /entityLabel\(\s*row\.lender_vendor_name\s*,\s*row\.lender_vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
    bad: /detail\.driver_name\s*\?\?\s*detail\.driver_id/,
    good: /entityLabel\(\s*detail\.driver_name\s*,\s*detail\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
    bad: /row\.driver_name\s*\?\?\s*row\.driver_id/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
    bad: /let driverLabel = row\.driver_id/,
    good: /let driverLabel = entityLabel\(\s*null\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
];

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

export function auditSibling(rel, src, bad, good) {
  const problems = [];
  if (bad.test(src)) {
    problems.push(`${rel}: still paints name||id (CLS-UUID-LABEL) — use entityLabel`);
  }
  if (!good.test(src)) {
    problems.push(`${rel}: must call entityLabel for display name`);
  }
  return problems;
}

function auditTree() {
  const problems = [
    ...auditEntityLabel(readFileSync(join(ROOT, TARGET), "utf8")),
    ...auditBillsPage(readFileSync(join(ROOT, BILLS), "utf8")),
  ];
  for (const s of SIBLINGS) {
    problems.push(...auditSibling(s.rel, readFileSync(join(ROOT, s.rel), "utf8"), s.bad, s.good));
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
  const sib = SIBLINGS[0];
  if (
    !auditSibling(sib.rel, "row.driver_name?.trim() || row.driver_id", sib.bad, sib.good).some((p) =>
      p.includes("name||id")
    )
  ) {
    failures.push("selftest: sibling bad pattern NOT detected");
  }

  const real = auditTree();
  if (real.length) failures.push(`selftest: real tree: ${real.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — entityLabel + Bills + sibling drain sites`);
}

main();
