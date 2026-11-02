#!/usr/bin/env node
/** Relay deposit review: MM/DD/YYYY + formatUsdCents (no toLocaleDateString / ad-hoc $). */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-relay-deposit-format";
const FILE = "apps/frontend/src/pages/fuel/components/RelayDepositReview.tsx";

function audit(src) {
  const fails = [];
  if (!src.includes('import { formatDateUS } from "../../../lib/formatDate"')) {
    fails.push(`${FILE}: must import formatDateUS`);
  }
  if (!src.includes('import { formatUsdCents } from "../../../lib/money"') && !src.includes("formatUsdCents")) {
    fails.push(`${FILE}: must use formatUsdCents`);
  }
  if (/toLocaleDateString\(/.test(src)) fails.push(`${FILE}: forbids toLocaleDateString`);
  if (/const usd = \(cents/.test(src) || /cents \/ 100\)\.toLocaleString/.test(src)) {
    fails.push(`${FILE}: forbids ad-hoc usd helper`);
  }
  if (!/formatDateUS\(d\.relay_created_at\)/.test(src)) {
    fails.push(`${FILE}: Date column must use formatDateUS(relay_created_at)`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const good = `
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";
render: (d) => formatDateUS(d.relay_created_at) || "—",
formatUsdCents(c.settled_cents)
`;
  if (audit(good).length) throw new Error("SELFTEST FAIL clean: " + JSON.stringify(audit(good)));
  const bad = good.replace("formatDateUS(d.relay_created_at)", "new Date(d.relay_created_at).toLocaleDateString()");
  if (audit(bad).length === 0) throw new Error("SELFTEST FAIL: toLocaleDateString undetected");
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

const fails = audit(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (fails.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Relay deposit review uses formatDateUS + formatUsdCents`);
