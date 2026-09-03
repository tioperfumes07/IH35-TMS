#!/usr/bin/env node
/**
 * verify-driver-bill-number-no-b-prefix.mjs
 *
 * GO-19 slice 03 (owner, 2026-09-03): "driver bill = load number, no B- prefix." The canonical
 * driver-bill-number.ts's driverBillNumberFromLoadNumber already returns the load number
 * unchanged (struck the old strip-L-/re-prefix-B- shape) -- but 3 other sites kept minting a
 * 'B-'-prefixed DRIVER bill number independently, live: settlements.service.ts's legacy
 * accounting.bills bridge, settlement-bill-payment-posting.service.ts's createBill call, and
 * BookLoadModalV4.tsx's driver-bill preview. Fixed here; this guard catches any of the 3 exact
 * regression shapes reappearing.
 *
 * Deliberately narrow (3 named sites, not a repo-wide "B-" scan): accounting.bills carries its
 * OWN, unrelated "B-####" numbering series for ordinary vendor bills (BillsPage, VendorDetail,
 * anomaly-detector, etc.) that this rule never touched and is not a regression target here --
 * a broad scan flagged 19 false positives across that unrelated code (and its own explanatory
 * comments) on first run, which is a false-positive generator, not a guard.
 */
import { readFileSync } from "node:fs";

const KNOWN_SITES = [
  "apps/backend/src/driver-finance/settlements.service.ts",
  "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
];

const REGRESSION_PATTERNS = [
  /'B-'\s*\|\|\s*regexp_replace\(l\.load_number/,
  /`B-\$\{b\.load_number/,
  /`B-\$\{reservedLoadNumber\}`/,
];

function loadSources() {
  const src = {};
  for (const path of KNOWN_SITES) src[path] = readFileSync(path, "utf8");
  return src;
}

export function collectFailures(src = loadSources()) {
  const failures = [];
  KNOWN_SITES.forEach((p, i) => {
    if (REGRESSION_PATTERNS[i].test(src[p])) {
      failures.push(`${p}: reintroduces a 'B-'-prefixed driver bill number (GO-19 slice 03 regression)`);
    }
  });
  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-driver-bill-number-no-b-prefix SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSources();
  const mutations = [
    [
      "settlements.service legacy bridge",
      KNOWN_SITES[0],
      "l.load_number AS bill_number,",
      "('B-' || regexp_replace(l.load_number, '^[Ll]-', '')) AS bill_number,",
    ],
    [
      "settlement-bill-payment-posting createBill",
      KNOWN_SITES[1],
      "billNumber: String(b.load_number ?? b.load_id),",
      "billNumber: `B-${b.load_number ?? b.load_id}`,",
    ],
    [
      "BookLoadModalV4 preview",
      KNOWN_SITES[2],
      "return reservedLoadNumber || \"—\";",
      "return `B-${reservedLoadNumber}`;",
    ],
  ];
  const escaped = [];
  for (const [name, p, from, to] of mutations) {
    if (!src[p].includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = { ...src, [p]: src[p].replace(from, to) };
    if (collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-driver-bill-number-no-b-prefix SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-driver-bill-number-no-b-prefix SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();

if (failures.length > 0) {
  console.error("verify-driver-bill-number-no-b-prefix: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-driver-bill-number-no-b-prefix: OK — all 3 known sites (settlements.service.ts legacy bridge, settlement-bill-payment-posting.service.ts createBill, BookLoadModalV4.tsx preview) mint the bare load number, no 'B-' prefix"
);
