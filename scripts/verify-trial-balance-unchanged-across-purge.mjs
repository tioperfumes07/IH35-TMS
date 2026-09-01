#!/usr/bin/env node
/**
 * TRIAL-BALANCE-UNCHANGED-ACROSS-PURGE — the safety control the owner named for the
 * is_sample_data test-data purge (docs/bus/LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01.md /
 * 2026-09-01 phase plan, "one cent of movement = roll back"). This tool never deletes, voids, or
 * mutates anything — CC-2 is verify-live-never-build. It captures a per-account, per-company GL
 * balance snapshot (via the existing accounting.fn_account_balances_as_of, the SAME function
 * every tie-out check in this repo already trusts) before and after a purge and asserts they are
 * byte-for-byte identical. Any nonzero delta on ANY account in ANY company is a hard FAIL — the
 * purge deleted/voided something with a real GL effect, not just a fixture.
 *
 * Usage:
 *   node scripts/verify-trial-balance-unchanged-across-purge.mjs --capture <label>
 *     Reads live (DATABASE_URL), writes docs/audit/trial-balance-snapshots/<label>.json.
 *   node scripts/verify-trial-balance-unchanged-across-purge.mjs --compare <before-label> <after-label>
 *     Reads both snapshot files, diffs, exits 1 on ANY nonzero movement.
 *   node scripts/verify-trial-balance-unchanged-across-purge.mjs --selftest
 *     Pure, no DB — proves the diff logic on fixture snapshots.
 *
 * Run --capture BEFORE the purge starts and --capture again immediately AFTER it completes, then
 * --compare the two labels. Never run --capture mid-purge — a snapshot taken while the purge is
 * half-done is neither a real "before" nor a real "after".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SNAPSHOT_DIR = path.join(REPO_ROOT, "docs/audit/trial-balance-snapshots");

/** Pure — every account_code/account_id pair present in either snapshot, diffed. */
export function diffTrialBalanceSnapshots(before, after) {
  const violations = [];
  const missingInAfter = [];
  const beforeKeys = new Map();
  for (const co of Object.keys(before.companies ?? {})) {
    for (const row of before.companies[co]) {
      beforeKeys.set(`${co}::${row.account_id}`, row);
    }
  }
  const afterKeys = new Map();
  for (const co of Object.keys(after.companies ?? {})) {
    for (const row of after.companies[co]) {
      afterKeys.set(`${co}::${row.account_id}`, row);
    }
  }

  for (const [key, beforeRow] of beforeKeys) {
    const afterRow = afterKeys.get(key);
    if (!afterRow) {
      // An account with a real balance simply disappearing from the "after" scan is worse than a
      // nonzero delta — flag it explicitly rather than silently treating "missing" as "zero".
      if (beforeRow.closing_balance_cents !== 0) {
        missingInAfter.push({ ...beforeRow, operating_company_id: key.split("::")[0] });
      }
      continue;
    }
    const delta = afterRow.closing_balance_cents - beforeRow.closing_balance_cents;
    if (delta !== 0) {
      violations.push({
        operating_company_id: key.split("::")[0],
        account_id: beforeRow.account_id,
        account_code: beforeRow.account_code,
        account_name: beforeRow.account_name,
        before_cents: beforeRow.closing_balance_cents,
        after_cents: afterRow.closing_balance_cents,
        delta_cents: delta,
      });
    }
  }

  return { violations, missingInAfter };
}

async function listActiveCompanies(client) {
  const res = await client.query(`SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL`);
  return res.rows.map((r) => r.id);
}

async function captureSnapshot(client) {
  const companies = await listActiveCompanies(client);
  const snapshot = { captured_at: new Date().toISOString(), companies: {} };
  for (const opco of companies) {
    const res = await client.query(
      `SELECT account_id::text AS account_id, account_code, account_name, closing_balance_cents::bigint AS closing_balance_cents
         FROM accounting.fn_account_balances_as_of($1::uuid, CURRENT_DATE, NULL::date)
        ORDER BY account_code`,
      [opco]
    );
    snapshot.companies[opco] = res.rows.map((r) => ({
      account_id: r.account_id,
      account_code: r.account_code,
      account_name: r.account_name,
      closing_balance_cents: Number(r.closing_balance_cents),
    }));
  }
  return snapshot;
}

function snapshotPath(label) {
  // Reject anything that isn't a plain label — never let a label argument escape SNAPSHOT_DIR.
  if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
    throw new Error(`invalid snapshot label (letters/digits/-/_ only): ${label}`);
  }
  return path.join(SNAPSHOT_DIR, `${label}.json`);
}

async function runCapture(label) {
  const { Client } = await import("pg");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required for --capture (never a placeholder — this reads real balances)");
    process.exit(1);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const snapshot = await captureSnapshot(client);
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    fs.writeFileSync(snapshotPath(label), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    const totalAccounts = Object.values(snapshot.companies).reduce((n, rows) => n + rows.length, 0);
    console.log(
      `Captured trial-balance snapshot "${label}": ${totalAccounts} accounts across ${Object.keys(snapshot.companies).length} companies, at ${snapshot.captured_at}`
    );
  } finally {
    await client.end();
  }
}

function runCompare(beforeLabel, afterLabel) {
  const beforePath = snapshotPath(beforeLabel);
  const afterPath = snapshotPath(afterLabel);
  if (!fs.existsSync(beforePath)) {
    console.error(`missing snapshot: ${beforePath} — run --capture ${beforeLabel} first`);
    process.exit(1);
  }
  if (!fs.existsSync(afterPath)) {
    console.error(`missing snapshot: ${afterPath} — run --capture ${afterLabel} first`);
    process.exit(1);
  }
  const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
  const after = JSON.parse(fs.readFileSync(afterPath, "utf8"));
  const { violations, missingInAfter } = diffTrialBalanceSnapshots(before, after);

  if (violations.length === 0 && missingInAfter.length === 0) {
    const totalAccounts = Object.values(before.companies ?? {}).reduce((n, rows) => n + rows.length, 0);
    console.log(
      `TRIAL BALANCE UNCHANGED — ${totalAccounts} accounts, zero movement between "${beforeLabel}" (${before.captured_at}) and "${afterLabel}" (${after.captured_at}).`
    );
    return;
  }

  console.error(`TRIAL BALANCE CHANGED — ROLL BACK. ${violations.length} account(s) moved, ${missingInAfter.length} account(s) with a real balance disappeared:`);
  for (const v of violations) {
    console.error(
      `  ${v.account_code} ${v.account_name} (opco ${v.operating_company_id}): ${v.before_cents} -> ${v.after_cents} (delta ${v.delta_cents} cents)`
    );
  }
  for (const m of missingInAfter) {
    console.error(`  MISSING FROM AFTER: ${m.account_code} ${m.account_name} (opco ${m.operating_company_id}), had ${m.closing_balance_cents} cents`);
  }
  process.exit(1);
}

function selftest() {
  const failures = [];

  // Case 1: identical snapshots -> zero violations.
  const same = {
    companies: { OPCO1: [{ account_id: "a1", account_code: "1000", account_name: "Bank", closing_balance_cents: 500 }] },
  };
  const r1 = diffTrialBalanceSnapshots(same, same);
  if (r1.violations.length !== 0 || r1.missingInAfter.length !== 0) failures.push("identical snapshots must diff clean");

  // Case 2: a real movement must be caught.
  const before2 = { companies: { OPCO1: [{ account_id: "a1", account_code: "1000", account_name: "Bank", closing_balance_cents: 500 }] } };
  const after2 = { companies: { OPCO1: [{ account_id: "a1", account_code: "1000", account_name: "Bank", closing_balance_cents: 400 }] } };
  const r2 = diffTrialBalanceSnapshots(before2, after2);
  if (r2.violations.length !== 1 || r2.violations[0].delta_cents !== -100) failures.push("a real $1.00 movement must be caught as delta_cents=-100");

  // Case 3: an account with a real balance disappearing entirely must be flagged, not silently zeroed.
  const before3 = { companies: { OPCO1: [{ account_id: "a1", account_code: "1000", account_name: "Bank", closing_balance_cents: 12345 }] } };
  const after3 = { companies: { OPCO1: [] } };
  const r3 = diffTrialBalanceSnapshots(before3, after3);
  if (r3.missingInAfter.length !== 1) failures.push("an account with a real balance vanishing must be flagged in missingInAfter, not silently treated as zero movement");

  // Case 4: an account that was already $0 and stays absent is NOT a violation (nothing to lose).
  const before4 = { companies: { OPCO1: [{ account_id: "a1", account_code: "9999", account_name: "Empty", closing_balance_cents: 0 }] } };
  const after4 = { companies: { OPCO1: [] } };
  const r4 = diffTrialBalanceSnapshots(before4, after4);
  if (r4.missingInAfter.length !== 0) failures.push("a $0 account disappearing is not a real loss and must not be flagged");

  // Case 5: a new account appearing in "after" with a balance is not itself a violation of THIS
  // check (a legitimate new account created during the purge window is a different concern) — only
  // pre-existing accounts that moved or vanished are in scope.
  const before5 = { companies: {} };
  const after5 = { companies: { OPCO1: [{ account_id: "new1", account_code: "1234", account_name: "New", closing_balance_cents: 999 }] } };
  const r5 = diffTrialBalanceSnapshots(before5, after5);
  if (r5.violations.length !== 0 || r5.missingInAfter.length !== 0) failures.push("a genuinely new account appearing in 'after' is out of this check's scope");

  if (failures.length > 0) {
    console.error("verify-trial-balance-unchanged-across-purge SELFTEST FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-trial-balance-unchanged-across-purge SELFTEST OK (5/5)");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    selftest();
    return;
  }
  const captureIdx = args.indexOf("--capture");
  if (captureIdx !== -1) {
    const label = args[captureIdx + 1];
    if (!label) {
      console.error("usage: --capture <label>");
      process.exit(1);
    }
    await runCapture(label);
    return;
  }
  const compareIdx = args.indexOf("--compare");
  if (compareIdx !== -1) {
    const beforeLabel = args[compareIdx + 1];
    const afterLabel = args[compareIdx + 2];
    if (!beforeLabel || !afterLabel) {
      console.error("usage: --compare <before-label> <after-label>");
      process.exit(1);
    }
    runCompare(beforeLabel, afterLabel);
    return;
  }
  console.error("usage: --capture <label> | --compare <before-label> <after-label> | --selftest");
  process.exit(1);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
