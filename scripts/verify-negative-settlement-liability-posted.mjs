#!/usr/bin/env node
/**
 * RULING B — NEGATIVE SETTLEMENTS (owner ruling 2026-09-01). "A negative net pay means the driver
 * owes the company. It posts AUTOMATICALLY to the driver's account — the receivable side, per the
 * locked decision that Driver Cash Advance = ASSET and Driver Escrow = LIABILITY... No settlement
 * may close negative without creating the corresponding account entry. Guard it." Never forgive,
 * never write off — write-off is a separate, deliberate, permissioned act, never a side effect of
 * closing a settlement (not built by this path).
 *
 * Live proof this closes: 7 settlements (S-2026-0003/0004/0006/0007/0008/0009/0010, -$8.00 to
 * -$234.99) were closed to status='locked' with no driver_finance.driver_liabilities row anywhere.
 * This guard locks BOTH terminal-close write paths (settlements.routes.ts's /finalize, status ->
 * 'locked'; pre-settlement.routes.ts's settle action, status -> 'approved' for load_bookended
 * settlements) so neither can regress to closing negative silently again.
 *
 *   node scripts/verify-negative-settlement-liability-posted.mjs
 *   node scripts/verify-negative-settlement-liability-posted.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-negative-settlement-liability-posted";
const SERVICE_FILE = "apps/backend/src/driver-finance/negative-settlement-liability.service.ts";
const FINALIZE_FILE = "apps/backend/src/driver-finance/settlements.routes.ts";
const PRESETTLE_FILE = "apps/backend/src/driver-finance/pre-settlement.routes.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(serviceSrc, finalizeSrc, presettleSrc) {
  const errs = [];
  if (!serviceSrc) return [`${SERVICE_FILE}: missing`];

  if (!/if \(!\(input\.netPay < 0\)\) return \{ outcome: "not_negative" \}/.test(serviceSrc)) {
    errs.push(`${SERVICE_FILE}: must gate strictly on netPay < 0`);
  }
  if (!/origin = 'driver_settlement' AND origin_id = \$2::uuid/.test(serviceSrc)) {
    errs.push(`${SERVICE_FILE}: must check for an existing liability keyed on origin+origin_id before inserting — idempotency, no double-post on a retried close`);
  }
  if (!/status = 'void'|status = 'written_off'|status = 'forgiven'/.test(serviceSrc)) {
    // Intentionally NOT required — this function only ever creates 'pending_recovery' liabilities
    // and never writes 'void'/'written_off'/'forgiven'. Assert the NEGATIVE instead: it must not
    // contain a write-off path.
  }
  if (/'written_off'|'forgiven'/.test(serviceSrc.replace(/\/\/.*$/gm, ""))) {
    errs.push(`${SERVICE_FILE}: must never write a write-off/forgiveness status — that is a separate, deliberate, permissioned act, never a side effect of closing a settlement`);
  }
  if (!/status: "pending_recovery"|'pending_recovery'/.test(serviceSrc)) {
    errs.push(`${SERVICE_FILE}: created liability must be status='pending_recovery' (the existing active-liability convention), not a terminal status`);
  }

  if (!finalizeSrc) errs.push(`${FINALIZE_FILE}: missing`);
  else if (!/postNegativeSettlementLiabilityIfNeeded\(client, \{/.test(finalizeSrc)) {
    errs.push(`${FINALIZE_FILE}: the /finalize route (status -> 'locked') must call postNegativeSettlementLiabilityIfNeeded before returning`);
  }

  if (!presettleSrc) errs.push(`${PRESETTLE_FILE}: missing`);
  else if (!/postNegativeSettlementLiabilityIfNeeded\(client, \{/.test(presettleSrc)) {
    errs.push(`${PRESETTLE_FILE}: the settle action (status -> 'approved') must call postNegativeSettlementLiabilityIfNeeded before returning`);
  }

  return errs;
}

function selftest() {
  const goodService = read(SERVICE_FILE) ?? "";
  const goodFinalize = read(FINALIZE_FILE) ?? "";
  const goodPresettle = read(PRESETTLE_FILE) ?? "";
  const goodErrs = assertGuard(goodService, goodFinalize, goodPresettle);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    ["bad1-not-strictly-negative", assertGuard(goodService.replace('if (!(input.netPay < 0)) return { outcome: "not_negative" };', "// removed"), goodFinalize, goodPresettle)],
    ["bad2-no-idempotency-check", assertGuard(goodService.replace(/origin = 'driver_settlement' AND origin_id = \$2::uuid/g, "1=1"), goodFinalize, goodPresettle)],
    ["bad3-writeoff-path-added", assertGuard(goodService + "\nconst x = 'written_off';\n", goodFinalize, goodPresettle)],
    ["bad4-finalize-not-wired", assertGuard(goodService, goodFinalize.replace(/postNegativeSettlementLiabilityIfNeeded\(client, \{/g, "postNegativeSettlementLiabilityIfNeededXXX(client, {"), goodPresettle)],
    ["bad5-presettle-not-wired", assertGuard(goodService, goodFinalize, goodPresettle.replace(/postNegativeSettlementLiabilityIfNeeded\(client, \{/g, "postNegativeSettlementLiabilityIfNeededXXX(client, {"))],
  ];

  for (const [name, res] of mutations) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS ${mutations.length}/${mutations.length} mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertGuard(read(SERVICE_FILE), read(FINALIZE_FILE), read(PRESETTLE_FILE));
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — both settlement-close paths post a driver_liabilities receivable when net_pay closes negative, idempotently, never a write-off`);
