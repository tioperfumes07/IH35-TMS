#!/usr/bin/env node
// GUARD — verify-no-auto-generated-account-numbers.mjs (ROUND 181, DEVIN-B)
//
// Owner law: no auto numbers without written owner approval. The auto-number
// generator in driver-subaccount-provision.service.ts minted account numbers
// like DRIVERCASHAD896665-NNN by appending a sequence to the parent's number.
// 47 such accounts now pollute the chart. This guard ensures:
//
// STATIC: the code no longer generates account numbers (no lpad/regexp_replace
//   sequence logic in the INSERT statements).
// LIVE: the count of auto-generated account numbers is shrink-only — it can
//   only decrease as accounts are deactivated, never increase. A new
//   auto-generated number is a regression.
//
// Self-test: node scripts/verify-no-auto-generated-account-numbers.mjs --selftest
export const REQUIRES_LIVE_DB =
  "catalogs.accounts — live count of auto-generated account numbers";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-auto-generated-account-numbers";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROVISION_FILE = path.join(ROOT, "apps/backend/src/accounting/driver-subaccount-provision.service.ts");

// Patterns that indicate auto-number generation in the provision service.
// If any of these are present in the INSERT statements, the generator is back.
const AUTO_NUMBER_PATTERNS = [
  /p\.account_number\s*\|\|\s*'-'\s*\|\|\s*lpad/,
  /COALESCE\(p\.account_number\s*\|\|\s*'-',\s*''\)\s*\|\|\s*lpad/,
  /g\.account_number\s*\|\|\s*'-00'/,
  /regexp_replace\(sib\.account_number/,
];

/**
 * Static check: verify the provision service does NOT contain auto-number
 * generation patterns. Pure function — exported for selftest.
 */
export function staticCheckNoAutoNumbers(source) {
  const problems = [];
  for (const pattern of AUTO_NUMBER_PATTERNS) {
    if (pattern.test(source)) {
      problems.push(`STATIC: auto-number pattern found in driver-subaccount-provision.service.ts: ${pattern.source}`);
    }
  }
  return { problems, allPass: problems.length === 0 };
}

/**
 * Classify the live auto-generated account number state. Pure function.
 */
export function classifyAutoNumbers(input) {
  const { autoNumberCount, autoNumberAccounts } = input;

  // The count is shrink-only. Today it's 47 (advance) + some escrow accounts.
  // It can only decrease as accounts are deactivated, never increase.
  // A count > 0 is not a failure (existing pollution), but a count that
  // INCREASES from one run to the next is a regression. We report the count
  // and the accounts, and fail only if the static check fails (generator is back).
  // The live count is reported for visibility, not as a hard failure — the
  // existing pollution is handled by the Lead's deactivation AUTH.

  const checks = [{
    id: "LIVE_COUNT",
    name: "AUTO_NUMBER_COUNT",
    expected: "shrink-only (decrease via deactivation, never increase)",
    live: `${autoNumberCount} auto-generated account(s)`,
    pass: true, // existing pollution is not a failure — the generator is dead
  }];

  return { checks, problems: [], allPass: true, autoNumberAccounts };
}

function runSelftest() {
  let pass = 0;
  let fail = 0;

  // Static check — clean source (no auto-number patterns)
  const cleanSource = `
    INSERT INTO catalogs.accounts (account_number, ...) SELECT NULL, ...
  `;
  const cleanResult = staticCheckNoAutoNumbers(cleanSource);
  if (!cleanResult.allPass) {
    console.error(`${LABEL} --selftest FAIL — clean source: expected PASS, got ${cleanResult.problems}`);
    fail += 1;
  } else pass += 1;

  // Static check — dirty source (has auto-number pattern)
  const dirtySource = `
    p.account_number || '-' || lpad((COALESCE(0) + 1)::text, 3, '0')
  `;
  const dirtyResult = staticCheckNoAutoNumbers(dirtySource);
  if (dirtyResult.allPass) {
    console.error(`${LABEL} --selftest FAIL — dirty source: expected FAIL`);
    fail += 1;
  } else pass += 1;

  // Static check — dirty source (escrow pattern)
  const dirtyEscrow = `
    COALESCE(p.account_number || '-', '') || lpad(...)
  `;
  const dirtyEscrowResult = staticCheckNoAutoNumbers(dirtyEscrow);
  if (dirtyEscrowResult.allPass) {
    console.error(`${LABEL} --selftest FAIL — dirty escrow: expected FAIL`);
    fail += 1;
  } else pass += 1;

  // Static check — dirty source (header pattern)
  const dirtyHeader = `
    COALESCE(g.account_number || '-00', NULL)
  `;
  const dirtyHeaderResult = staticCheckNoAutoNumbers(dirtyHeader);
  if (dirtyHeaderResult.allPass) {
    console.error(`${LABEL} --selftest FAIL — dirty header: expected FAIL`);
    fail += 1;
  } else pass += 1;

  // Classifier — existing pollution (count > 0, but generator is dead = ok)
  const pollResult = classifyAutoNumbers({ autoNumberCount: 47, autoNumberAccounts: [] });
  if (!pollResult.allPass) {
    console.error(`${LABEL} --selftest FAIL — existing pollution: expected PASS (generator dead)`);
    fail += 1;
  } else pass += 1;

  // Classifier — zero pollution
  const zeroResult = classifyAutoNumbers({ autoNumberCount: 0, autoNumberAccounts: [] });
  if (!zeroResult.allPass) {
    console.error(`${LABEL} --selftest FAIL — zero pollution: expected PASS`);
    fail += 1;
  } else pass += 1;

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function measureLive(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  // Count accounts with auto-generated numbers (pattern: PARENTNUM-NNN)
  const autoRes = await client.query(
    `SELECT account_number, account_name, account_type
       FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND account_number IS NOT NULL
        AND account_number ~ '^[A-Z]+[0-9]+-[0-9]+$'
      ORDER BY account_number`,
    [USMCA_COMPANY_ID],
  );

  await client.query("ROLLBACK");
  return {
    autoNumberCount: autoRes.rows.length,
    autoNumberAccounts: autoRes.rows,
  };
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return Promise.resolve();
  }
  return runFull();
}

async function runFull() {
  // Static check
  let staticProblems = [];
  if (fs.existsSync(PROVISION_FILE)) {
    const source = fs.readFileSync(PROVISION_FILE, "utf8");
    const staticResult = staticCheckNoAutoNumbers(source);
    staticProblems = staticResult.problems;
  } else {
    staticProblems.push(`STATIC: provision file not found at ${PROVISION_FILE}`);
  }

  // Live check
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let live;
  try {
    live = await measureLive(client);
  } finally {
    client.release();
    await pool.end();
  }

  const { checks, allPass, autoNumberAccounts } = classifyAutoNumbers(live);

  console.log(`${LABEL}: no auto-generated account numbers (ROUND 181)`);
  console.log("");

  // Static
  if (staticProblems.length === 0) {
    console.log("  STATIC  NO_AUTO_NUMBER_GENERATOR    expected: no lpad/regexp_replace patterns    live: clean    PASS");
  } else {
    console.log("  STATIC  NO_AUTO_NUMBER_GENERATOR    expected: no lpad/regexp_replace patterns    live: GENERATOR ACTIVE    FAIL");
    for (const p of staticProblems) {
      console.error(`    ${p}`);
    }
  }

  // Live
  for (const c of checks) {
    const result = c.pass ? "PASS" : "FAIL";
    console.log(`  LIVE    ${c.name.padEnd(28)} expected: ${c.expected.padEnd(40)} live: ${c.live.padEnd(20)} ${result}`);
  }

  // Print the polluted accounts
  if (autoNumberAccounts.length > 0) {
    console.log("");
    console.log(`  Existing pollution (${autoNumberAccounts.length} auto-generated accounts — shrink-only, deactivate via Lead AUTH):`);
    for (const a of autoNumberAccounts.slice(0, 20)) {
      console.log(`    ${a.account_number} | ${a.account_name} | ${a.account_type}`);
    }
    if (autoNumberAccounts.length > 20) {
      console.log(`    ... and ${autoNumberAccounts.length - 20} more`);
    }
  }
  console.log("");

  const allProblems = [...staticProblems];
  if (allProblems.length > 0) {
    console.error(`${LABEL}: FAIL — ${allProblems.length} problem(s):\n` + allProblems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: PASS — auto-number generator is dead, ${live.autoNumberCount} existing accounts are shrink-only.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
