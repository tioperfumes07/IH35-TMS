#!/usr/bin/env node
/**
 * DRIVER-ESCROW-VISUALIZER-BALANCES-AVAILABLE-LABEL-MISLEADING-COUNT (residual)
 *
 * countDriverEscrowKpis()'s drivers_with_escrow_balance query used to also require
 * `d.deactivated_at IS NULL`, silently excluding a deactivated-but-still-owing driver from the
 * count even when they hold a real nonzero escrow balance (Banking Home showed 1 while
 * /banking/driver-escrow's post-fix count showed 2 for the same underlying data). This diverges
 * from escrow-visualizer.routes.ts's own documented policy: a separated/terminated driver's
 * outstanding escrow is a real liability the company still owes/holds and must not silently
 * disappear from a count.
 *
 * This guard fails if the `withBalanceRes` query in driver-escrow-counts.ts reintroduces a
 * deactivated-driver exclusion. active_drivers and drivers_with_active_escrow_account are
 * deliberately NOT touched by this guard — they are different metrics and were never part of
 * this finding.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/banking/driver-escrow-counts.ts";
const LABEL = "verify-driver-escrow-counts-deactivated-inclusion-parity";

export function check(text) {
  const failures = [];
  const match = text.match(/const withBalanceRes = await client\.query[\s\S]*?\);/);
  if (!match) {
    failures.push(`${FILE}: withBalanceRes query not found`);
    return failures;
  }
  const block = match[0];
  if (/deactivated_at\s+IS\s+NULL/i.test(block)) {
    failures.push(`${FILE}: withBalanceRes must not exclude deactivated drivers — a deactivated driver with a real nonzero escrow balance is a real liability`);
  }
  if (!/COALESCE\(ea\.balance_cents,\s*0\)\s*<>\s*0/i.test(block)) {
    failures.push(`${FILE}: withBalanceRes lost its nonzero-balance scoping — must not become an unscoped count`);
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
  console.log(`${LABEL}: OK — withBalanceRes includes deactivated-but-still-owing drivers, still scoped to a real nonzero balance`);
}

function selftest() {
  const good = `
    const withBalanceRes = await client.query<{ count: number }>(
      \`
        SELECT count(DISTINCT d.id)::int AS count
        FROM mdata.drivers d
        JOIN accounting.escrow_accounts ea ON ea.holder_id = d.id
        WHERE d.operating_company_id = $1::uuid
          AND COALESCE(ea.balance_cents, 0) <> 0
      \`,
      [operatingCompanyId]
    );
  `;
  if (check(good).length) throw new Error(`PASS fail: ${JSON.stringify(check(good))}`);

  const regressed = good.replace(
    "AND COALESCE(ea.balance_cents, 0) <> 0",
    "AND d.deactivated_at IS NULL\n          AND COALESCE(ea.balance_cents, 0) <> 0"
  );
  if (!check(regressed).length) throw new Error("FAIL fail: reintroduced deactivated exclusion should have been caught");

  const unscoped = good.replace("AND COALESCE(ea.balance_cents, 0) <> 0", "");
  if (!check(unscoped).length) throw new Error("FAIL fail: lost nonzero-balance scoping should have been caught");

  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
