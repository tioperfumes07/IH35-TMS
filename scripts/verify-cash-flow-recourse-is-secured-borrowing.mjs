#!/usr/bin/env node
/**
 * ENG-CF / ROUND 354 D-4 — Faro is full recourse → secured borrowing.
 * Collections OPERATING. Faro advances FINANCING. ASU 2016-15 investing
 * does not touch 1200/1230/1235 reserve.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SERVICE = "apps/backend/src/accounting/cash-flow.service.ts";
const NEEDLES = [
  "export function resolveCashFlowBucket",
  "FARO_FINANCING_NUMBERS",
  '"2150"',
  "factoring_advance",
  "FARO_RESERVE_NUMBERS",
  '"1230"',
  "factoring_reserve_release",
  "COLLECTION_SOURCES",
  "factoring_customer_payment",
];

export function run(root = process.cwd()) {
  const problems = [];
  const src = fs.readFileSync(path.join(root, SERVICE), "utf8");
  for (const needle of NEEDLES) {
    if (!src.includes(needle)) problems.push(`${SERVICE}: missing ${needle}`);
  }
  if (!/bucket:\s*"financing"/.test(src) || !/FARO_FINANCING_/.test(src)) {
    problems.push(`${SERVICE}: Faro advances must resolve to financing`);
  }
  const reserveBlock = src.slice(src.indexOf("FARO_RESERVE_NUMBERS"));
  if (/investing/.test(reserveBlock.slice(0, 400))) {
    problems.push(`${SERVICE}: reserve block must not mention investing`);
  }
  return problems;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "cf-recourse-"));
  const tmpDir = path.join(tmp, "apps/backend/src/accounting");
  fs.mkdirSync(tmpDir, { recursive: true });
  const good = `export function resolveCashFlowBucket() {}
const FARO_FINANCING_NUMBERS = new Set(["2150"]);
factoring_advance
const FARO_RESERVE_NUMBERS = new Set(["1230"]);
factoring_reserve_release
const COLLECTION_SOURCES = new Set(["factoring_customer_payment"]);
return { bucket: "financing", unclassified: false };`;
  fs.writeFileSync(path.join(tmpDir, "cash-flow.service.ts"), good);
  if (run(tmp).length) {
    console.error("verify-cash-flow-recourse-is-secured-borrowing --selftest FAIL clean");
    process.exit(1);
  }
  fs.writeFileSync(path.join(tmpDir, "cash-flow.service.ts"), "export function nope() {}");
  if (!run(tmp).length) {
    console.error("verify-cash-flow-recourse-is-secured-borrowing --selftest FAIL plant");
    process.exit(1);
  }
  console.log("verify-cash-flow-recourse-is-secured-borrowing --selftest OK");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = run();
  if (problems.length) {
    console.error("verify-cash-flow-recourse-is-secured-borrowing FAIL");
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log("verify-cash-flow-recourse-is-secured-borrowing OK");
}
