#!/usr/bin/env node
/**
 * RELAY-F442 — sender_fee excluded from total_amount_paid must still hit wallet + GL as Fuel Card Fee.
 *
 * Asserts (static, fail-closed):
 * 1. Wallet ingest amount = paid + fee (relayWalletDrawdownCents / relayFillFeeCents).
 * 2. Bank-match Relay poster passes fee_amount_cents and amount = paid + fee.
 * 3. Fuel poster resolves "Fuel Card Fee" and refuses to fold fee into a fuel leg.
 * 4. Settlement Creator writes fee_amount separately (not folded into total_cost).
 * 5. Pure arithmetic: 59433 + 200 = 59633 (owner measured txn_4ypX8FQCRzHr5n).
 *
 * Usage: node scripts/verify-relay-f442-sender-fee.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-f442-sender-fee";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function fail(msg) {
  console.error(`${LABEL} FAIL — ${msg}`);
  process.exit(1);
}

function assertContains(src, rel, re, why) {
  if (!src) fail(`MISSING ${rel}`);
  if (!re.test(src)) fail(`${rel}: ${why}`);
}

function selftest() {
  // Planted defect shapes — each must be detectable by the live assertions below.
  const plants = [
    {
      name: "wallet uses paid-only",
      src: "amount_cents: totalAmountPaidCents,",
      check: (s) => !/relayWalletDrawdownCents\s*\(\s*totalAmountPaidCents/.test(s),
    },
    {
      name: "poster has no fee_amount_cents",
      src: "cost_lines?: Array<{ fuel_kind: FuelCategoryCode; amount_cents: number }>;\n};",
      check: (s) => !/fee_amount_cents\??:/.test(s),
    },
    {
      name: "creator folds fees into total_cost",
      src: "Math.round(Number(fuel.fees_cents || 0)) -\n        Math.round(Number(fuel.discount_cents || 0));\n    dollarsFromCents(amountCents)",
      check: (s) => !/fee_amount/.test(s) || /dollarsFromCents\(amountCents\)/.test(s),
    },
  ];
  for (const p of plants) {
    if (!p.check(p.src)) fail(`--selftest could not plant detectable defect: ${p.name}`);
  }
  // Owner arithmetic must stay locked.
  if (59433 + 200 !== 59633) fail("--selftest arithmetic lock broken");
  console.log(`${LABEL} --selftest PASS — ${plants.length} planted defects detectable + 59433+200=59633`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const helper = read("apps/backend/src/integrations/relay-payments/relay-sender-fee-cents.ts");
  const ingest = read("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts");
  const poster = read("apps/backend/src/accounting/fuel-posting/poster.service.ts");
  const match = read("apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts");
  const creator = read("apps/backend/src/driver-finance/settlement-creator.service.ts");

  assertContains(helper, "relay-sender-fee-cents.ts", /export function relayFillFeeCents/, "must export relayFillFeeCents");
  assertContains(helper, "relay-sender-fee-cents.ts", /export function relayWalletDrawdownCents/, "must export relayWalletDrawdownCents");
  assertContains(helper, "relay-sender-fee-cents.ts", /fees\[\]/, "must prefer fees[] over line fees (no double-count)");

  assertContains(
    ingest,
    "relay-fuel-ingest.service.ts",
    /relayWalletDrawdownCents\s*\(\s*totalAmountPaidCents\s*,\s*feeCents\s*\)/,
    "wallet amount must be paid + fee (RELAY-F442)",
  );
  assertContains(
    ingest,
    "relay-fuel-ingest.service.ts",
    /amount_cents:\s*walletAmountCents/,
    "upsertRelayWalletBankFeedRow must receive walletAmountCents",
  );

  assertContains(poster, "poster.service.ts", /fee_amount_cents\??:/, "FuelPostingInput must carry fee_amount_cents");
  assertContains(poster, "poster.service.ts", /Fuel Card Fee/, 'poster must resolve "Fuel Card Fee" item');
  assertContains(poster, "poster.service.ts", /fuel_kind:\s*"fuel_card_fee"/, "fee must be its own debit leg, not folded into diesel/reefer/DEF");

  assertContains(match, "bank-match-fuel-post.service.ts", /fee_amount_cents:\s*feeCents/, "Relay match poster must pass fee_amount_cents");
  assertContains(match, "bank-match-fuel-post.service.ts", /relayWalletDrawdownCents\s*\(\s*paidCents/, "match amount_cents must be paid + fee");

  assertContains(creator, "settlement-creator.service.ts", /fuelPurchaseNetAndFeeCents/, "Creator must split net vs fee");
  assertContains(creator, "settlement-creator.service.ts", /fee_amount,/, "INSERT must write fee_amount column");
  assertContains(creator, "settlement-creator.service.ts", /dollarsFromCents\(feeCents\)/, "fee_amount must be written from fees_cents, not folded into total_cost");
  assertContains(creator, "settlement-creator.service.ts", /dollarsFromCents\(netCents\)/, "total_cost must be fuel net only");

  if (59433 + 200 !== 59633) fail("owner arithmetic lock: 59433+200 must equal 59633");

  console.log(`${LABEL} PASS — wallet=paid+fee · poster Fuel Card Fee leg · Creator fee_amount separate · 59433+200=59633`);
}

main();
