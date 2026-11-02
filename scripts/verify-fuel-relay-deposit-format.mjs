#!/usr/bin/env node
/** Relay deposit review: MM/DD/YYYY + formatUsdCents render calls (no toLocaleDateString / ad-hoc $). */
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
  if (!src.includes('import { formatUsdCents } from "../../../lib/money"')) {
    fails.push(`${FILE}: must import formatUsdCents from lib/money`);
  }
  if (/toLocaleDateString\(/.test(src)) fails.push(`${FILE}: forbids toLocaleDateString`);
  if (/const usd = \(cents/.test(src) || /cents \/ 100\)\.toLocaleString/.test(src)) {
    fails.push(`${FILE}: forbids ad-hoc usd helper`);
  }
  if (!/formatDateUS\(d\.relay_created_at\)/.test(src)) {
    fails.push(`${FILE}: Date column must use formatDateUS(relay_created_at)`);
  }
  // Codex QA 11-02: import alone is not enough — each money cell must call formatUsdCents(.
  const moneyCalls = (src.match(/formatUsdCents\s*\(/g) || []).length;
  if (moneyCalls < 3) {
    fails.push(`${FILE}: expected ≥3 formatUsdCents( render/value calls (found ${moneyCalls})`);
  }
  if (!/formatUsdCents\(\s*c\.settled_cents\s*\)/.test(src)) {
    fails.push(`${FILE}: card settled amount must render formatUsdCents(c.settled_cents)`);
  }
  if (!/formatUsdCents\(\s*d\.total_amount_cents\s*\)/.test(src)) {
    fails.push(`${FILE}: deposit total must render formatUsdCents(d.total_amount_cents)`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const good = `
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";
render: (d) => formatDateUS(d.relay_created_at) || "—",
formatUsdCents(c.settled_cents)
formatUsdCents(d.total_amount_cents)
formatUsdCents(settledFor(cls))
`;
  if (audit(good).length) throw new Error("SELFTEST FAIL clean: " + JSON.stringify(audit(good)));
  const badDate = good.replace("formatDateUS(d.relay_created_at)", "new Date(d.relay_created_at).toLocaleDateString()");
  if (audit(badDate).length === 0) throw new Error("SELFTEST FAIL: toLocaleDateString undetected");
  // Codex plant: import kept, all formatUsdCents( calls replaced by String(
  const badMoney = good.replaceAll("formatUsdCents(", "String(");
  if (!audit(badMoney).some((f) => f.includes("formatUsdCents"))) {
    throw new Error("SELFTEST FAIL: formatUsdCents→String plant escaped");
  }
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

const fails = audit(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (fails.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Relay deposit review uses formatDateUS + formatUsdCents render calls`);
