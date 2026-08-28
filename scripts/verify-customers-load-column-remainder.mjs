#!/usr/bin/env node
/**
 * Customers load-column remainder — honest Built + applicability drops.
 * Keep: detail.quality (related_load_id EntityLink) · detail.loads (loads table EntityLink).
 * Drop: billing / lanes / contracts / pnl chrome without a load FK drill.
 *
 * @matrix-built {"modules":["customers"],"cols":["load"],"leafRe":"^(detail\\.quality|detail\\.loads)$","task":"CURSOR-CUSTOMERS-LOAD-COLUMN-REMAINDER","vertical":"column-wave"}
 * @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leaves":["detail.loads"],"task":"CUST-F5875-DETAIL-LOADS-REVERSE-EXACT-LEAF","vertical":"column-wave"}
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
const LOADS_ROUTE = "apps/backend/src/mdata/loads.routes.ts";
const SELF = "scripts/verify-customers-load-column-remainder.mjs";
const ENTITY_GUARD = "scripts/verify-entity-label-rejects-uuid-shaped-name.mjs";
const REVERSE_HEADER = ' * @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leaves":["detail.loads"],"task":"CUST-F5875-DETAIL-LOADS-REVERSE-EXACT-LEAF","vertical":"column-wave"}';
const OLD_REVERSE_HEADER = '/** @matrix-built {"modules":["customers"],"cols":["driver","unit","connectivity","reverse_link"],"leafRe":"^detail\\\\.loads$","task":"CLS-CUSTOMER-LOAD-DRIVER-UNIT-LINKS"} */';

const KEEP = ["detail.quality", "detail.loads"];
const DROP = ["detail.billing", "detail.lanes", "detail.lanes.create", "detail.contracts", "detail.pnl"];

const WIRING = [
  [DETAIL, /<EntityLinkOrTombstone\s+kind="load"[\s\S]{0,80}id=\{event\.related_load_id\}/],
  [DETAIL, /<EntityLinkOrTombstone\s+kind="load"[\s\S]{0,80}id=\{load\.id\}/],
  [DETAIL, /listAllLoads\(\{\s*customer_id: id,/],
  [DETAIL, /operating_company_id: operatingCompanyId \? \[operatingCompanyId\] : undefined,/],
  [DETAIL, /activeTab === "Loads"/],
  [DETAIL, /onRowClick=\{\(load\) => navigate\(`\/dispatch\/loads\/\$\{load\.id\}`\)\}/],
];

const PRODUCER_WIRING = [
  /SELECT COUNT\(\*\)::int AS total_count[\s\S]{0,220}JOIN LATERAL mdata\.get_customer_same_company\(\s*l\.customer_id,\s*l\.operating_company_id\s*\) c ON true/,
  /c\.customer_name AS customer_name[\s\S]{0,900}FROM mdata\.loads l\s+JOIN LATERAL mdata\.get_customer_same_company\(\s*l\.customer_id,\s*l\.operating_company_id\s*\) c ON true/,
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
  if (!required("detail.loads").includes("reverse_link")) failures.push("customers:detail.loads must retain reverse_link Required");
  for (const id of DROP) {
    if (required(id).includes("load")) failures.push(`customers:${id} must not claim unowned load FK (honesty drop)`);
  }

  const audit = matrix.honesty_audit?.load_column_2026_08_14_customers_remainder;
  if (!audit || audit.finding !== "CURSOR-CUSTOMERS-LOAD-COLUMN-REMAINDER") {
    failures.push("customers honesty_audit.load_column_2026_08_14_customers_remainder must record this remainder");
  }

  for (const [file, pattern] of WIRING) {
    if (!pattern.test(source.detail || "")) failures.push(`${file}: missing real EntityLinkOrTombstone kind="load" wiring`);
  }
  for (const pattern of PRODUCER_WIRING) {
    if (!pattern.test(source.loadsRoute || "")) failures.push(`${LOADS_ROUTE}: customer-filtered load list must preserve archived customer history through the same-company resolver`);
  }
  if (!source.self.split("\n").includes(REVERSE_HEADER)) failures.push(`${SELF}: exact reverse Built header missing`);
  if (source.entityGuard.includes(OLD_REVERSE_HEADER)) failures.push(`${ENTITY_GUARD}: legacy broad customer reverse credit must stay removed`);

  return failures;
}

function loadSource() {
  return { matrix: read(MATRIX), detail: read(DETAIL), loadsRoute: read(LOADS_ROUTE), self: read(SELF), entityGuard: read(ENTITY_GUARD) };
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
    () => {
      const m = JSON.parse(source.matrix);
      m.leaves.find((l) => l.id === "detail.loads").required = m.leaves.find((l) => l.id === "detail.loads").required.filter((c) => c !== "reverse_link");
      return { ...source, matrix: JSON.stringify(m) };
    },
    () => ({ ...source, self: source.self.replace(REVERSE_HEADER, `${REVERSE_HEADER}.removed`) }),
    () => ({ ...source, entityGuard: `${OLD_REVERSE_HEADER}\n${source.entityGuard}` }),
  ];
  for (const [, pattern] of WIRING.slice(2)) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    mutations.push(() => ({ ...source, detail: source.detail.replace(globalPattern, "/* planted reverse defect */") }));
  }
  for (const pattern of PRODUCER_WIRING) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    mutations.push(() => ({ ...source, loadsRoute: source.loadsRoute.replace(globalPattern, "/* planted archived-customer load-list defect */") }));
  }
  mutations.forEach((mut, i) => {
    if (!verify(mut()).length) throw new Error(`selftest mutation ${i + 1} survived`);
  });
  console.log(`${LABEL} --selftest OK — ${mutations.length}/${mutations.length} planted defects rejected`);
}

console.log(`${LABEL} PASS — customers load remainder honest (keep quality+loads; drop billing/lanes/contracts/pnl)`);
