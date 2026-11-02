#!/usr/bin/env node
/** Settlement Reimbursements + Extra Pay amounts use formatUsd (not ad-hoc toFixed). */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-reimburse-extrapay-formatusd";
const FILES = [
  "apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx",
  "apps/frontend/src/pages/driver-finance/components/ExtraPaySection.tsx",
];

function audit(src, file) {
  const fails = [];
  if (!src.includes('import { formatUsd } from "../../../lib/money"') && !src.includes("formatUsd")) {
    fails.push(`${file}: must import/use formatUsd`);
  }
  if (/\$\{Number\(line\.amount\)\.toFixed\(2\)\}/.test(src) || /`\$\$\{Number\(line\.amount\)\.toFixed/.test(src)) {
    fails.push(`${file}: still uses ad-hoc toFixed money`);
  }
  if (/Subtotal: \$\$\{subtotal\.toFixed/.test(src) || /Subtotal: \$\{subtotal\.toFixed/.test(src)) {
    fails.push(`${file}: subtotal still ad-hoc toFixed`);
  }
  if (!/formatUsd\(line\.amount\)/.test(src)) fails.push(`${file}: amount cell must use formatUsd(line.amount)`);
  if (!/formatUsd\(subtotal\)/.test(src)) fails.push(`${file}: subtotal must use formatUsd(subtotal)`);
  return fails;
}

if (process.argv.includes("--selftest")) {
  const good = `
import { formatUsd } from "../../../lib/money";
render: (line) => formatUsd(line.amount),
Subtotal: {formatUsd(subtotal)}
`;
  if (audit(good, "x").length) throw new Error("SELFTEST FAIL clean");
  const bad = good.replace("formatUsd(line.amount)", "`$${Number(line.amount).toFixed(2)}`");
  if (audit(bad, "x").length === 0) throw new Error("SELFTEST FAIL: toFixed undetected");
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

const fails = FILES.flatMap((f) => audit(fs.readFileSync(path.join(ROOT, f), "utf8"), f));
if (fails.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Reimbursements + Extra Pay use formatUsd`);
