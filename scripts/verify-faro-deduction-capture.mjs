#!/usr/bin/env node
// Faro deduction capture (shared backlog, migration 202614301200). The export carries, per invoice,
//   face - Escrow Rsv - Cash Rsv - Discount - Fees - Dispatch - Sch Fee = Net Adv.
// This guard keeps the capture from silently regressing:
//   1. parseFaroCsv reads Cash Rsv, Dispatch and Sch Fee by header, null when the export lacks the column;
//   2. both factor.faro_invoice_lines inserts write the four deduction columns;
//   3. the identity test over the owner's committed export exists and still demands 82 of 82.
// Static source scan; --selftest plants each regression and requires a failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-faro-deduction-capture";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  parser: "apps/backend/src/factoring/faro-csv-import.ts",
  writer: "apps/backend/src/data-infra/data-infra.service.ts",
  test: "apps/backend/src/factoring/__tests__/faro-funding-identity.test.ts",
  fixture: "docs/reconcile/faro-purchase-report-all-2026-09-23.csv",
};
const COLUMNS = ["cash_rsv_amount_cents", "fees_amount_cents", "dispatch_amount_cents", "schedule_fee_amount_cents"];

export function check(read) {
  const failures = [];
  const parser = read(FILES.parser);
  const writer = read(FILES.writer);
  const test = read(FILES.test);
  if (parser == null || writer == null || test == null) return ["a guarded file is missing"];
  if (read(FILES.fixture) == null) failures.push(`${FILES.fixture} (the owner's export) is missing`);

  for (const [field, header] of [["cash_rsv_amount_cents", "cash rsv"], ["dispatch_amount_cents", "dispatch"], ["schedule_fee_amount_cents", "sch fee"]]) {
    if (!new RegExp(`headerIndex\\(headers, \\[[^\\]]*"${header}"`).test(parser)) failures.push(`parseFaroCsv no longer looks up the "${header}" column`);
    if (!new RegExp(`${field}: \\w+Idx >= 0 \\? parseMoneyToCents\\([^)]*\\)\\) : null`).test(parser)) {
      failures.push(`parseFaroCsv does not set ${field} to null when the column is absent (a guessed 0 is not a capture)`);
    }
  }
  const inserts = [...writer.matchAll(/INSERT INTO factor\.faro_invoice_lines \(([\s\S]*?)\)\s*VALUES/g)].map((m) => m[1]);
  if (inserts.length < 2) failures.push(`expected 2 factor.faro_invoice_lines inserts, found ${inserts.length}`);
  inserts.forEach((cols, i) => {
    for (const c of COLUMNS) if (!cols.includes(c)) failures.push(`faro_invoice_lines insert #${i + 1} does not write ${c}`);
  });
  if (!/expect\(funded\.length\)\.toBe\(82\)/.test(test)) failures.push("the funding-identity test no longer demands 82 funded invoices");
  if (!/expectedNetAdvanceCents\(l\) !== l\.advance_amount_cents/.test(test)) failures.push("the funding-identity test no longer compares against the net advance");
  return failures;
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

if (process.argv.includes("--selftest")) {
  const real = Object.fromEntries(Object.values(FILES).map((rel) => [rel, read(rel)]));
  const clean = check((rel) => real[rel]);
  if (clean.length) {
    console.error(`${LABEL} --selftest FAIL: the real tree is not clean:\n  - ${clean.join("\n  - ")}`);
    process.exit(1);
  }
  const plants = [
    ["Sch Fee lookup removed", FILES.parser, (s) => s.replace('["sch fee", "schedule fee"]', '["schedule fee"]').replace('"sch fee"', '"xx"')],
    ["Cash Rsv defaults to 0", FILES.parser, (s) => s.replace("cash_rsv_amount_cents: cashRsvIdx >= 0 ? parseMoneyToCents(String(cells[cashRsvIdx] ?? \"0\")) : null", "cash_rsv_amount_cents: cashRsvIdx >= 0 ? parseMoneyToCents(String(cells[cashRsvIdx] ?? \"0\")) : 0")],
    ["an insert stops writing dispatch", FILES.writer, (s) => s.replace("          dispatch_amount_cents,\n", "")],
    ["the 82 assertion weakened", FILES.test, (s) => s.replace("expect(funded.length).toBe(82)", "expect(funded.length).toBeGreaterThan(0)")],
  ];
  for (const [what, file, mutate] of plants) {
    const mutated = mutate(real[file]);
    if (mutated === real[file]) {
      console.error(`${LABEL} --selftest FAIL: plant "${what}" did not apply`);
      process.exit(1);
    }
    if (check((rel) => (rel === file ? mutated : real[rel])).length === 0) {
      console.error(`${LABEL} --selftest FAIL: plant "${what}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${plants.length} planted regressions each caught; real tree clean`);
  process.exit(0);
}

const failures = check(read);
if (failures.length) {
  console.error(`${LABEL}: FAIL\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Cash Rsv, Dispatch and Sch Fee parsed (null when absent); both inserts write the 4 deduction columns; the 82-of-82 identity test is intact.`);
