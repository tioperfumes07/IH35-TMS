#!/usr/bin/env node
/**
 * VENDOR-OPEN-BALANCE-INCLUDES-DRAFT-BILLS
 *
 * accounting.vendor_balances' balance_cents SUM had NO status filter at all — a draft (or void)
 * bill silently inflated a vendor's headline "Open balance" figure on /vendors and the vendor
 * profile, contradicting the SAME page's own AP Aging section (which already correctly excludes
 * drafts). This guard asserts the migration's balance_cents expression carries the same status
 * filter open_bill_count/next_due_date already use, and stays defensively COALESCEd to 0 (never
 * NULL) for a vendor with no currently-open bills.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "db/migrations/202613190000_vendor_balances_exclude_draft_bills.sql";
const LABEL = "verify-vendor-balances-view-excludes-draft-bills";

const OPEN_STATUS_ARRAY = "ARRAY['open', 'partial', 'partially_paid', 'unpaid']";

export function check(text) {
  const failures = [];
  const match = text.match(/COALESCE\(\s*SUM\(amount_cents - paid_cents\) FILTER \([\s\S]*?\),\s*0\s*\)::bigint AS balance_cents/);
  if (!match) {
    failures.push(`${FILE}: balance_cents expression not found in the expected COALESCE(SUM(...) FILTER(...), 0) shape`);
    return failures;
  }
  const block = match[0];
  if (!block.includes(OPEN_STATUS_ARRAY)) {
    failures.push(`${FILE}: balance_cents FILTER does not scope to the same open-status set open_bill_count uses (${OPEN_STATUS_ARRAY})`);
  }
  if (!/COALESCE\(\s*SUM/.test(block)) {
    failures.push(`${FILE}: balance_cents is not wrapped in COALESCE(...) — a vendor with no currently-open bills would get NULL instead of 0`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const failures = check(text);
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — balance_cents excludes draft/non-open bills and never returns NULL`);
}

function selftest() {
  const good = `
SELECT
  operating_company_id,
  vendor_id,
  COALESCE(
    SUM(amount_cents - paid_cents) FILTER (
      WHERE status = ANY (ARRAY['open', 'partial', 'partially_paid', 'unpaid'])
    ),
    0
  )::bigint AS balance_cents,
  COUNT(*) AS open_bill_count
FROM normalized n
GROUP BY operating_company_id, vendor_id;
`;
  if (check(good).length) throw new Error(`PASS fail: ${JSON.stringify(check(good))}`);

  const noFilter = `
SELECT
  operating_company_id,
  vendor_id,
  SUM(amount_cents - paid_cents)::bigint AS balance_cents
FROM normalized n
GROUP BY operating_company_id, vendor_id;
`;
  if (!check(noFilter).length) throw new Error("FAIL fail: unfiltered SUM (the original bug) should have been caught");

  const noCoalesce = good.replace(/COALESCE\(\s*SUM\(amount_cents - paid_cents\) FILTER \(([\s\S]*?)\),\s*0\s*\)/, "SUM(amount_cents - paid_cents) FILTER ($1)");
  if (noCoalesce === good) throw new Error("selftest setup error: COALESCE replacement did not match");
  if (!check(noCoalesce).length) throw new Error("FAIL fail: missing COALESCE (NULL-for-no-open-bills regression) should have been caught");

  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
