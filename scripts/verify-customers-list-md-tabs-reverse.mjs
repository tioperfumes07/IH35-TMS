#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^(list\\.create|md\\.customer_details|md\\.new_transaction|md\\.transaction_list)$","task":"CUST-F001-customers-list-md-reverse-remainder"} */
/**
 * GUARD: customers:list.create / md.customer_details / md.new_transaction / md.transaction_list
 * all have required reverse_link but nothing claimed exact ownership (found via
 * verify-codex-vertical-nonmoney-zero-remainder census, 2026-08-22, same sweep that found the
 * drivers:{cash_advances,deductions,disputes} gap). All four were already correctly wired in
 * apps/frontend/src/pages/Customers.tsx — this guard is their first exact-leaf assertion, not a
 * product fix:
 *   - list.create: after a successful create, navigate() lands on the new record's own canonical
 *     URL (a self-drill proving the create produced a real, addressable customer).
 *   - md.transaction_list: each row drills to its own canonical invoice.
 *   - md.new_transaction: the header action forwards into the invoice queue pre-scoped to this
 *     customer (LINK-F5171-class deep link).
 *   - md.customer_details: the factoring-company field renders a real tombstone-safe EntityLink,
 *     not a bare vendor id.
 *
 * Self-test: node scripts/verify-customers-list-md-tabs-reverse.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-list-md-tabs-reverse";
const PAGE = "apps/frontend/src/pages/Customers.tsx";
const MATRIX = "docs/specs/scoreboard/modules/customers.required.json";
const FILES = [PAGE, MATRIX];
const LEAVES = ["list.create", "md.customer_details", "md.new_transaction", "md.transaction_list"];

const CHECKS = [
  { name: "list.create self-drill after create", file: PAGE, pattern: /onSuccess:\s*async\s*\(customer\)\s*=>\s*\{[\s\S]{0,600}navigate\(`\/customers\/\$\{customer\.id\}`\)/ },
  { name: "md.transaction_list row drill", file: PAGE, pattern: /onRowClick=\{\(invoice\)\s*=>\s*navigate\(`\/accounting\/invoices\/\$\{invoice\.id\}`\)\}/ },
  { name: "md.new_transaction forward drill", file: PAGE, pattern: /data-testid="customer-header-new-transaction"[\s\S]{0,50}/ },
  { name: "md.new_transaction target route", file: PAGE, pattern: /navigate\(`\/accounting\/invoices\?customer_id=\$\{selectedCustomer\.id\}`\)/ },
  { name: "md.customer_details factoring-company reverse drill", file: PAGE, pattern: /factoring_company_vendor_id[\s\S]{0,150}EntityLinkOrTombstone[\s\S]{0,80}kind="vendor"/ },
];

function readSources() {
  return Object.fromEntries(FILES.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));
}

function run(sources) {
  const failures = CHECKS.filter((check) => !check.pattern.test(sources[check.file])).map((check) => check.name);
  try {
    const matrix = JSON.parse(sources[MATRIX]);
    for (const id of LEAVES) {
      const leaf = matrix.leaves?.find((item) => item.id === id);
      if (!leaf?.required?.includes("reverse_link")) failures.push(`${MATRIX}: exact Required ownership missing ${id}:reverse_link`);
    }
  } catch {
    failures.push(`${MATRIX}: customers Required matrix must parse`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  const liveFailures = run(live);
  if (liveFailures.length) {
    console.error(`${LABEL} SELFTEST FAIL live:\n- ${liveFailures.join("\n- ")}`);
    process.exit(1);
  }
  for (const check of CHECKS) {
    const flags = check.pattern.flags.includes("g") ? check.pattern.flags : `${check.pattern.flags}g`;
    const planted = live[check.file].replace(new RegExp(check.pattern.source, flags), "/* planted customers reverse defect */");
    if (planted === live[check.file] || !run({ ...live, [check.file]: planted }).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  for (const id of LEAVES) {
    const plantedMatrix = live[MATRIX].replace(`"id": "${id}"`, `"id": "${id}.removed"`);
    if (plantedMatrix === live[MATRIX] || !run({ ...live, [MATRIX]: plantedMatrix }).includes(`${MATRIX}: exact Required ownership missing ${id}:reverse_link`)) {
      console.error(`${LABEL} SELFTEST FAIL — exact leaf ownership stayed green: ${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${CHECKS.length + LEAVES.length}/${CHECKS.length + LEAVES.length} planted defects rejected`);
  process.exit(0);
}

const failures = run(readSources());
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers list.create/md.* reverse_link ratcheted`);
