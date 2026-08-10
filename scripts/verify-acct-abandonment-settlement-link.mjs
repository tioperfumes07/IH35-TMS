#!/usr/bin/env node
/**
 * verify-acct-abandonment-settlement-link — Abandonment queue settlement reverse (46/46).
 *
 * Root cause: applied_to_settlement_id returned on chargeback rows but the queue showed
 * load/driver only — no reverse drill to the settlement that absorbed the chargeback.
 *
 * Fix: Settlement column with EntityLink kind=settlement. No posting/GL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-abandonment-settlement-link";
const PAGE = "apps/frontend/src/pages/accounting/AbandonmentQueuePage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(src) {
  const errors = [];
  if (!src) {
    errors.push(`${PAGE}: missing`);
    return errors;
  }
  if (!src.includes('key: "applied_to_settlement_id"') || !src.includes('label: "Settlement"')) {
    errors.push(`${PAGE}: must expose Settlement column on applied_to_settlement_id`);
  }
  if (!/kind="settlement"/.test(src) || !/applied_to_settlement_id/.test(src)) {
    errors.push(`${PAGE}: must EntityLink kind=settlement on applied_to_settlement_id`);
  }
  if (!/onError:\s*\(e: unknown\) => pushToast\(userFacingApiError\(e, "Could not approve chargeback"\)/.test(src)) {
    errors.push(`${PAGE}: approval failure must use shared human-facing API error copy`);
  }
  return errors;
}

function selftest() {
  const good = `
    { key: "applied_to_settlement_id", label: "Settlement",
      render: (row) => <EntityLink kind="settlement" id={row.applied_to_settlement_id} /> }
    onError: (e: unknown) => pushToast(userFacingApiError(e, "Could not approve chargeback"), "error")
  `;
  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAILED on good fixture`);
    process.exit(1);
  }
  const bad = `render: (row) => String(row.status ?? "")`;
  if (check(bad).length < 2) {
    console.error(`${LABEL} SELFTEST FAILED: planted gap must fail`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`PASS: ${LABEL} --selftest`);
  process.exit(0);
}

const errors = check(read(PAGE));
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log(`PASS: ${LABEL}`);
