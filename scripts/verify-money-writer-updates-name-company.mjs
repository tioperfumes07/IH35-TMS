#!/usr/bin/env node
// ROUND 301 P0 #007–#011 (CC-1) — every UPDATE / DELETE in these money writers names its company. Each was scoped by
// inheritance only (the id came from a company-scoped read on the same transaction), which leaks nothing today and
// silently stops being true the day someone passes an id from elsewhere. The standard (QBO / NetSuite parity): a
// posting's UPDATE or DELETE names its company. This guard parses each file's string / template literals and fails
// on any UPDATE <schema>.<table> or DELETE FROM <schema>.<table> statement that does not mention operating_company_id.
// The list only grows: an engine joins it once its writes are scoped.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-money-writer-updates-name-company";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FILES = [
  "apps/backend/src/driver-finance/settlement-contract-terms.service.ts",
  "apps/backend/src/accounting/fuel-posting/poster.service.ts",
  "apps/backend/src/accounting/posting-engine.service.ts",
  "apps/backend/src/accounting/recurring.worker.ts",
  "apps/backend/src/accounting/void.service.ts",
];

/** SQL statements inside backtick / quote literals that UPDATE or DELETE a schema-qualified table. */
export function statements(src) {
  const out = [];
  const re = /`([^`]*)`|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    if (/\b(UPDATE\s+[a-z_]+\.[a-z_]+\s+SET|DELETE\s+FROM\s+[a-z_]+\.[a-z_]+)\b/i.test(body)) {
      out.push({ line: src.slice(0, m.index).split("\n").length, sql: body });
    }
  }
  return out;
}

export function problems(file, src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");
  return statements(code)
    .filter((s) => !/operating_company_id/.test(s.sql))
    .map((s) => `${file}:${s.line} ${s.sql.trim().split("\n")[0].trim()} — names no operating_company_id`);
}

export function run() {
  return FILES.flatMap((f) => problems(f, readFileSync(path.join(ROOT, f), "utf8")));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const own = run();
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      "await client.query(`UPDATE accounting.posting_batches SET batch_status = 'posted' WHERE id = $1::uuid`, [id]);",
      "await client.query(`\n  DELETE FROM driver_finance.settlement_lines\n  WHERE id = $1::uuid\n`, [id]);",
    ];
    for (const plant of plants) {
      if (!problems("plant.ts", plant).length) { console.error(`${LABEL} --selftest FAIL — plant not caught: ${plant}`); process.exit(1); }
    }
    if (problems("ok.ts", "await client.query(`UPDATE mdata.drivers SET x = 1 WHERE id = $1 AND operating_company_id = $2`, [a, b]);").length) {
      console.error(`${LABEL} --selftest FAIL — a scoped UPDATE was flagged`); process.exit(1);
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught; scoped statement allowed)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — every UPDATE / DELETE in ${FILES.length} money writers names operating_company_id.`);
}
