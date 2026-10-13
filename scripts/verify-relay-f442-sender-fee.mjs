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


/**
 * LEAD 443.123 — THE one paid rule. relayFuelPaidCents recognises a legacy CSV row (stored paid already carries its
 * recorded fee) ONLY on exact equality with ingest_source csv_import and no per-line fee; never a tolerance or plug.
 * Every wallet / match / roll-forward consumer goes through it (or its SQL twin relayFuelWalletAmountSql).
 */
export function checkOnePaidRule(srcs) {
  const p = [];
  const h = srcs.helper ?? "";
  const fn = h.slice(h.indexOf("export function relayFuelPaidCents"), h.indexOf("export function relayFuelWalletAmountSql"));
  if (!/export function relayFuelPaidCents/.test(h)) p.push("relay-sender-fee-cents.ts: relayFuelPaidCents missing (the one paid rule)");
  if (!/stored === product \+ fee/.test(fn)) p.push("relayFuelPaidCents: legacy shape must be EXACT equality stored === product + fee");
  if (!/ingest_source === "csv_import"/.test(fn) || !/lineFees === 0/.test(fn)) p.push("relayFuelPaidCents: legacy shape must require csv_import AND no per-line fee");
  if (/Math\.abs\(|<=\s*\d|tolerance/i.test(fn)) p.push("relayFuelPaidCents: a tolerance / plug is forbidden (exact cents only)");
  if (!/export function relayFuelWalletAmountSql/.test(h) || !/= \$\{product\} \+ \$\{fees\}/.test(h)) p.push("relay-sender-fee-cents.ts: SQL twin relayFuelWalletAmountSql must use the same exact equality");
  if (!/relayFuelPaidCents\(/.test(srcs.match ?? "") || !/amountCents = paid\.wallet_cents/.test(srcs.match ?? "")) p.push("bank-match-fuel-post.service.ts: the poster must take paid / fee / wallet from relayFuelPaidCents");
  if (!/RELAY_FUEL_WALLET_AMOUNT_SQL = relayFuelWalletAmountSql\("r"\)/.test(srcs.bankMatch ?? "") || !/relayFuelPaidCents\(/.test(srcs.bankMatch ?? "")) p.push("relay-bank-match.service.ts: wallet SQL + walletCentsForFill must use the one paid rule");
  if (!/relayFuelPaidCents\(/.test(srcs.rollForward ?? "")) p.push("relay-wallet-roll-forward.service.ts: must use the one paid rule");
  if (!/relayFuelPaidCents\(/.test(srcs.bankFeed ?? "")) p.push("relay-wallet-bank-feed.service.ts: must use the one paid rule");
  return p;
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
  // LEAD 443.123 — the one paid rule: real sources pass; a tolerance, a dropped csv_import gate, a consumer that
  // bypasses the rule are each caught.
  const real = onePaidRuleSources();
  if (checkOnePaidRule(real).length) fail(`--selftest: real sources fail the one paid rule: ${checkOnePaidRule(real).join("; ")}`);
  const paidPlants = [
    ["tolerance plug", { ...real, helper: real.helper.replace("stored === product + fee", "Math.abs(stored - (product + fee)) <= 200") }],
    ["csv_import gate dropped", { ...real, helper: real.helper.replace('input.ingest_source === "csv_import" && ', "") }],
    ["poster bypasses the rule", { ...real, match: real.match.replace("amountCents = paid.wallet_cents", "amountCents = paidCents + feeCents") }],
    ["drawer SQL bypasses the rule", { ...real, bankMatch: real.bankMatch.replace('RELAY_FUEL_WALLET_AMOUNT_SQL = relayFuelWalletAmountSql("r")', "RELAY_FUEL_WALLET_AMOUNT_SQL = `(paid + fees)`") }],
    ["roll-forward bypasses the rule", { ...real, rollForward: real.rollForward.replaceAll("relayFuelPaidCents(", "relayFillFeeCents(") }],
  ];
  for (const [name, srcs] of paidPlants) {
    if (checkOnePaidRule(srcs).length === 0) fail(`--selftest could not catch planted defect: ${name}`);
  }
  // Owner arithmetic must stay locked.
  if (59433 + 200 !== 59633) fail("--selftest arithmetic lock broken");
  console.log(`${LABEL} --selftest PASS — ${plants.length + 5} planted defects detectable + 59433+200=59633`);
}

function onePaidRuleSources() {
  return {
    helper: read("apps/backend/src/integrations/relay-payments/relay-sender-fee-cents.ts"),
    match: read("apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts"),
    bankMatch: read("apps/backend/src/accounting/bank-recon/relay-bank-match.service.ts"),
    rollForward: read("apps/backend/src/integrations/relay-payments/relay-wallet-roll-forward.service.ts"),
    bankFeed: read("apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts"),
  };
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
  const matchDrawer = read("apps/backend/src/accounting/bank-recon/match.service.ts");
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
  // LEAD 443.123: paid + fee now comes from the one paid rule (relayFuelPaidCents -> relayWalletDrawdownCents(fuel, fee)).
  assertContains(match, "bank-match-fuel-post.service.ts", /amountCents = paid\.wallet_cents/, "match amount_cents must be the one paid rule's wallet (paid + fee)");
  assertContains(helper, "relay-sender-fee-cents.ts", /wallet_cents: relayWalletDrawdownCents\(fuel, fee\)/, "the one paid rule's wallet must be fuel + fee");
  const paidProblems = checkOnePaidRule(onePaidRuleSources());
  if (paidProblems.length) fail(paidProblems.join("; "));
  assertContains(
    matchDrawer,
    "match.service.ts",
    /RELAY_FUEL_WALLET_AMOUNT_SQL/,
    "Match drawer loadLedgerAmountCents / candidates must use F442 wallet drawdown SQL",
  );

  assertContains(creator, "settlement-creator.service.ts", /fuelPurchaseNetAndFeeCents/, "Creator must split net vs fee");
  assertContains(creator, "settlement-creator.service.ts", /fee_amount,/, "INSERT must write fee_amount column");
  assertContains(creator, "settlement-creator.service.ts", /dollarsFromCents\(feeCents\)/, "fee_amount must be written from fees_cents, not folded into total_cost");
  assertContains(creator, "settlement-creator.service.ts", /dollarsFromCents\(netCents\)/, "total_cost must be fuel net only");

  if (59433 + 200 !== 59633) fail("owner arithmetic lock: 59433+200 must equal 59633");

  console.log(`${LABEL} PASS — wallet=paid+fee · poster Fuel Card Fee leg · Creator fee_amount separate · 59433+200=59633`);
}

main();
