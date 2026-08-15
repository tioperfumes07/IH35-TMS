#!/usr/bin/env node
/**
 * Customers load-column remainder — honest Built + applicability drops.
 * Keep: detail.quality (related_load_id EntityLink) · detail.loads (loads table EntityLink).
 * Drop: billing / lanes / contracts / pnl chrome without a load FK drill.
 *
 * @matrix-built {"modules":["customers"],"cols":["load"],"leafRe":"^(detail\\.quality|detail\\.loads)$","task":"CURSOR-CUSTOMERS-LOAD-COLUMN-REMAINDER","vertical":"column-wave"}
 *
 * Run: node scripts/verify-customers-load-column-remainder.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-load-column-remainder";

const MATRIX = "docs/specs/scoreboard/modules/customers.required.json";
const DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";

const KEEP = ["detail.quality", "detail.loads"];
const DROP = ["detail.billing", "detail.lanes", "detail.lanes.create", "detail.contracts", "detail.pnl"];

const WIRING = [
  [DETAIL, /kind="load"[\s\S]{0,80}id=\{event\.related_load_id\}/],
  [DETAIL, /kind="load"[\s\S]{0,80}id=\{load\.id\}/],
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function verify(source) {
  const failures = [];
  let matrix;
  try {
    matrix = JSON.parse(source.matrix);
  } catch {
    failures.push(`${MATRIX} must remain valid JSON`);
    return failures;
  }

  const required = (id) => matrix.leaves?.find((leaf) => leaf.id === id)?.required ?? [];
  for (const id of KEEP) {
    if (!required(id).includes("load")) failures.push(`customers:${id} must retain load Required (wired EntityLink)`);
  }
  for (const id of DROP) {
    if (required(id).includes("load")) failures.push(`customers:${id} must not claim unowned load FK (honesty drop)`);
  }

  const audit = matrix.honesty_audit?.load_column_2026_08_14_customers_remainder;
  if (!audit || audit.finding !== "CURSOR-CUSTOMERS-LOAD-COLUMN-REMAINDER") {
    failures.push("customers honesty_audit.load_column_2026_08_14_customers_remainder must record this remainder");
  }

  for (const [file, pattern] of WIRING) {
    if (!pattern.test(source.detail || "")) failures.push(`${file}: missing real EntityLink kind="load" wiring`);
  }

  return failures;
}

function loadSource() {
  return { matrix: read(MATRIX), detail: read(DETAIL) };
}

const source = loadSource();
const failures = verify(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    () => {
      const m = JSON.parse(source.matrix);
      m.leaves.find((l) => l.id === "detail.loads").required = m.leaves
        .find((l) => l.id === "detail.loads")
        .required.filter((c) => c !== "load");
      return { ...source, matrix: JSON.stringify(m) };
    },
    () => {
      const m = JSON.parse(source.matrix);
      m.leaves.find((l) => l.id === "detail.billing").required.push("load");
      return { ...source, matrix: JSON.stringify(m) };
    },
    () => ({ ...source, detail: source.detail.replace(/kind="load"/g, 'kind="customer"') }),
  ];
  mutations.forEach((mut, i) => {
    if (!verify(mut()).length) throw new Error(`selftest mutation ${i + 1} survived`);
  });
  console.log(`${LABEL} --selftest OK`);
}

console.log(`${LABEL} PASS — customers load remainder honest (keep quality+loads; drop billing/lanes/contracts/pnl)`);
