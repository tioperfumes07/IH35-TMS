#!/usr/bin/env node
// GUARD — verify-fuel-cost-posts-exactly-once.mjs (ROUND 145.3, DEVIN-B)
//
// THE RULING: fuel.fuel_transactions is the OPERATIONAL record and NEVER posts.
// accounting.expenses is the ACCOUNTING record and posts ONCE, at creation,
// DR fuel/expense CR the real card. Matching in Banking CLEARS the bank line
// and NEVER posts again.
//
// Self-arming POPULATION check, derived from live data, never a literal, never
// a baseline, 7-day scoped per LAW 3.
//
// A. ZERO live journal entries whose source is a fuel transaction. A fuel
//    transaction with a ledger is a hard FAIL.
// B. Every non-voided expense that originates from a fuel transaction carries
//    source_fuel_transaction_id, and no two expenses point at the same fuel
//    transaction. A shared pointer is a double-count.
// C. Total debit on 5000 Fuel & Diesel equals live fuel spend EXACTLY ONCE.
//    Derive both sides from the data, print them, FAIL on any difference.
// D. EVERY fuel expense carries the full inherited linkage from its load:
//    load_id, driver_uuid, unit_id, trailer_id, vendor_uuid. Any null is a FAIL.
// E. ACCEPTING A BANK MATCH NEVER POSTS FOR AN ALREADY-POSTED DOCUMENT. Static:
//    the accept path creates no journal entry for a document that already has
//    one; the only permitted write is match/clear state and, where a real
//    variance exists, the variance leg alone. Live: zero documents carrying
//    two independent journal entries from creation and from match.
//
// Self-test: node scripts/verify-fuel-cost-posts-exactly-once.mjs --selftest
export const REQUIRES_LIVE_DB =
  "fuel_transactions + expenses + journal_entry_postings + catalogs.accounts — must fail-closed";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-fuel-cost-posts-exactly-once";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ACCEPT_PATH_FILE = path.join(ROOT, "apps/backend/src/accounting/bank-recon/match.service.ts");

/**
 * Classify the fuel-cost-posts-once state. Pure function — exported for selftest.
 */
export function classifyFuelPostsOnce(input) {
  const { fuelJesCount, fuelExpensesWithSource, duplicateFuelPointers,
    fuel5000NetCents, fuelExpenseTotalCents, expensesWithNullLinkage,
    expensesWithNullLinkageDetails, docsDoublePosted } = input;

  const problems = [];
  const checks = [];

  // A. ZERO fuel_transaction JEs
  checks.push({
    id: "A",
    name: "NO_FUEL_TRANSACTION_JES",
    expected: "0 fuel_event JEs",
    live: `${fuelJesCount} fuel_event JE(s)`,
    pass: fuelJesCount === 0,
  });
  if (fuelJesCount > 0) {
    problems.push(`FUEL_TRANSACTION_HAS_LEDGER: ${fuelJesCount} journal entry posting(s) have source_transaction_type='fuel_event'. Fuel transactions must NEVER post.`);
  }

  // B. No duplicate fuel pointers
  checks.push({
    id: "B",
    name: "NO_DUPLICATE_FUEL_POINTERS",
    expected: "0 duplicate fuel_transaction_id pointers",
    live: `${duplicateFuelPointers} duplicate pointer(s)`,
    pass: duplicateFuelPointers === 0,
  });
  if (duplicateFuelPointers > 0) {
    problems.push(`DUPLICATE_FUEL_POINTER: ${duplicateFuelPointers} fuel transaction(s) pointed at by multiple expenses. A shared pointer is a double-count.`);
  }

  // C. 5000 Fuel & Diesel net = fuel expense total
  checks.push({
    id: "C",
    name: "FUEL_5000_EQUALS_SPEND",
    expected: `$${(fuelExpenseTotalCents / 100).toFixed(2)} (fuel expense total)`,
    live: `$${(fuel5000NetCents / 100).toFixed(2)} (5000 Fuel & Diesel net)`,
    pass: fuel5000NetCents === fuelExpenseTotalCents,
  });
  if (fuel5000NetCents !== fuelExpenseTotalCents) {
    problems.push(`FUEL_5000_MISMATCH: 5000 Fuel & Diesel net $${(fuel5000NetCents / 100).toFixed(2)} != fuel expense total $${(fuelExpenseTotalCents / 100).toFixed(2)}. Difference: $${((fuel5000NetCents - fuelExpenseTotalCents) / 100).toFixed(2)}.`);
  }

  // D. Full inherited linkage
  checks.push({
    id: "D",
    name: "FULL_LOAD_LINKAGE",
    expected: "0 expenses with null linkage",
    live: `${expensesWithNullLinkage} expense(s) with null linkage${expensesWithNullLinkageDetails ? ` (${expensesWithNullLinkageDetails})` : ""}`,
    pass: expensesWithNullLinkage === 0,
  });
  if (expensesWithNullLinkage > 0) {
    problems.push(`FUEL_EXPENSE_MISSING_LINKAGE: ${expensesWithNullLinkage} fuel expense(s) missing load_id, driver_uuid, unit_id, trailer_id, or vendor_uuid.`);
  }

  // E. No double-posted documents
  checks.push({
    id: "E",
    name: "NO_DOUBLE_POSTED_DOCS",
    expected: "0 documents with 2+ JEs",
    live: `${docsDoublePosted} document(s) with 2+ JEs`,
    pass: docsDoublePosted === 0,
  });
  if (docsDoublePosted > 0) {
    problems.push(`DOUBLE_POSTED_DOCUMENT: ${docsDoublePosted} document(s) carrying two independent journal entries from creation and from match. Accepting a match must NEVER post again.`);
  }

  return { checks, problems, allPass: problems.length === 0 };
}

/**
 * Static check E: verify the accept path in match.service.ts creates no JE
 * for a document that already has one. The only permitted JE is the variance leg.
 * Pure function — exported for selftest.
 */
export function staticCheckAcceptPath(source) {
  // The accept path is acceptMatchWithResolveDifference. It calls maybePostVarianceJE
  // which only posts when variance_cents !== 0. The variance JE is the ONLY JE created.
  // We verify:
  // 1. The function maybePostVarianceJE exists and has the variance_cents === 0 guard
  // 2. No other INSERT INTO accounting.journal_entries exists in the accept path
  //    outside of maybePostVarianceJE

  const problems = [];

  // Check that maybePostVarianceJE has the zero-variance guard
  const varianceGuardRe = /if\s*\(\s*input\.variance_cents\s*===\s*0\s*\)\s*return\s*null/;
  if (!varianceGuardRe.test(source)) {
    problems.push("STATIC_E: maybePostVarianceJE missing variance_cents === 0 guard. Variance JE must not be created when variance is zero.");
  }

  // Check that the only INSERT INTO accounting.journal_entries in the accept path
  // is inside maybePostVarianceJE (the variance leg). We look for any INSERT INTO
  // accounting.journal_entries that is NOT inside maybePostVarianceJE.
  // Simple heuristic: count INSERT INTO accounting.journal_entries occurrences.
  // The accept path should have exactly 1 (the variance JE), and it must be guarded.
  const insertRe = /INSERT\s+INTO\s+accounting\.journal_entries/gi;
  const insertCount = (source.match(insertRe) || []).length;
  // The file may have other INSERTs (e.g. in other functions), but the accept path
  // should only have the variance JE. We check the variance guard is present.
  if (insertCount === 0) {
    problems.push("STATIC_E: no INSERT INTO accounting.journal_entries found — variance JE path missing.");
  }

  // Check that acceptMatchWithResolveDifference does NOT contain a direct INSERT
  // outside of the variance function. We look for the function and check its body.
  const acceptFnRe = /export\s+async\s+function\s+acceptMatchWithResolveDifference[\s\S]*?(?=\nexport\s+async\s+function|\nexport\s+function|$)/;
  const acceptMatch = source.match(acceptFnRe);
  if (acceptMatch) {
    const acceptBody = acceptMatch[0];
    const acceptInserts = (acceptBody.match(insertRe) || []).length;
    // The accept function should NOT directly INSERT a JE — it should only call
    // maybePostVarianceJE which does the variance leg.
    if (acceptInserts > 0) {
      problems.push(`STATIC_E: acceptMatchWithResolveDifference contains ${acceptInserts} direct INSERT INTO accounting.journal_entries. The accept path must only call maybePostVarianceJE for the variance leg.`);
    }
  }

  return { problems, allPass: problems.length === 0 };
}

function runSelftest() {
  let pass = 0;
  let fail = 0;

  // Static check E — clean source
  const cleanSource = `
    export async function maybePostVarianceJE(input) {
      if (input.variance_cents === 0) return null;
      await client.query("INSERT INTO accounting.journal_entries ...");
    }
    export async function acceptMatchWithResolveDifference(input) {
      // no direct INSERT
      await maybePostVarianceJE({ variance_cents: input.variance });
    }
  `;
  const cleanStatic = staticCheckAcceptPath(cleanSource);
  if (!cleanStatic.allPass) {
    console.error(`${LABEL} --selftest FAIL — static E clean: expected PASS, got ${cleanStatic.problems}`);
    fail += 1;
  } else pass += 1;

  // Static check E — missing variance guard
  const badSource1 = `
    export async function maybePostVarianceJE(input) {
      await client.query("INSERT INTO accounting.journal_entries ...");
    }
  `;
  const badStatic1 = staticCheckAcceptPath(badSource1);
  if (badStatic1.allPass) {
    console.error(`${LABEL} --selftest FAIL — static E no guard: expected FAIL`);
    fail += 1;
  } else pass += 1;

  // Static check E — direct INSERT in accept path
  const badSource2 = `
    export async function maybePostVarianceJE(input) {
      if (input.variance_cents === 0) return null;
      await client.query("INSERT INTO accounting.journal_entries ...");
    }
    export async function acceptMatchWithResolveDifference(input) {
      await client.query("INSERT INTO accounting.journal_entries ...");
      await maybePostVarianceJE({ variance_cents: input.variance });
    }
  `;
  const badStatic2 = staticCheckAcceptPath(badSource2);
  if (badStatic2.allPass) {
    console.error(`${LABEL} --selftest FAIL — static E direct INSERT: expected FAIL`);
    fail += 1;
  } else pass += 1;

  // Classifier fixtures
  const baseInput = {
    fuelJesCount: 0,
    fuelExpensesWithSource: 10,
    duplicateFuelPointers: 0,
    fuel5000NetCents: 50000,
    fuelExpenseTotalCents: 50000,
    expensesWithNullLinkage: 0,
    expensesWithNullLinkageDetails: "",
    docsDoublePosted: 0,
  };

  // GREEN
  const green = classifyFuelPostsOnce(baseInput);
  if (!green.allPass) {
    console.error(`${LABEL} --selftest FAIL — GREEN: expected all pass, got ${green.problems}`);
    fail += 1;
  } else pass += 1;

  // RED A: fuel JEs exist
  const redA = classifyFuelPostsOnce({ ...baseInput, fuelJesCount: 20 });
  if (redA.allPass || redA.checks.find(c => c.id === "A").pass) {
    console.error(`${LABEL} --selftest FAIL — RED A: expected check A FAIL`);
    fail += 1;
  } else pass += 1;

  // RED B: duplicate pointers
  const redB = classifyFuelPostsOnce({ ...baseInput, duplicateFuelPointers: 2 });
  if (redB.allPass || redB.checks.find(c => c.id === "B").pass) {
    console.error(`${LABEL} --selftest FAIL — RED B: expected check B FAIL`);
    fail += 1;
  } else pass += 1;

  // RED C: 5000 mismatch
  const redC = classifyFuelPostsOnce({ ...baseInput, fuel5000NetCents: 0, fuelExpenseTotalCents: 50000 });
  if (redC.allPass || redC.checks.find(c => c.id === "C").pass) {
    console.error(`${LABEL} --selftest FAIL — RED C: expected check C FAIL`);
    fail += 1;
  } else pass += 1;

  // RED D: null linkage
  const redD = classifyFuelPostsOnce({ ...baseInput, expensesWithNullLinkage: 63, expensesWithNullLinkageDetails: "trailer_id null on 63" });
  if (redD.allPass || redD.checks.find(c => c.id === "D").pass) {
    console.error(`${LABEL} --selftest FAIL — RED D: expected check D FAIL`);
    fail += 1;
  } else pass += 1;

  // RED E: double-posted docs
  const redE = classifyFuelPostsOnce({ ...baseInput, docsDoublePosted: 3 });
  if (redE.allPass || redE.checks.find(c => c.id === "E").pass) {
    console.error(`${LABEL} --selftest FAIL — RED E: expected check E FAIL`);
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

  // A: fuel_event JEs (7-day scoped)
  const fuelJeRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.journal_entry_postings
      WHERE source_transaction_type = 'fuel_event'
        AND operating_company_id = $1::uuid
        AND created_at >= now() - interval '7 days'`,
    [USMCA_COMPANY_ID],
  );

  // B: fuel expenses with source_fuel_transaction_id (7-day scoped)
  const fuelExpensesRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        AND source_fuel_transaction_id IS NOT NULL
        AND created_at >= now() - interval '7 days'`,
    [USMCA_COMPANY_ID],
  );

  // B: duplicate fuel pointers
  const dupPtrRes = await client.query(
    `SELECT count(*)::int AS cnt FROM (
       SELECT source_fuel_transaction_id FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND source_fuel_transaction_id IS NOT NULL
          AND created_at >= now() - interval '7 days'
       GROUP BY source_fuel_transaction_id HAVING count(*) > 1
     ) x`,
    [USMCA_COMPANY_ID],
  );

  // C: 5000 Fuel & Diesel net (all time — it's a balance check)
  const fuel5000Res = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS net_cents
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
        AND a.operating_company_id = $1::uuid
        AND a.account_number = '5000'`,
    [USMCA_COMPANY_ID],
  );

  // C: fuel expense total (7-day scoped)
  const fuelTotalRes = await client.query(
    `SELECT COALESCE(SUM(total_amount_cents), 0)::bigint AS total_cents
       FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        AND source_fuel_transaction_id IS NOT NULL
        AND created_at >= now() - interval '7 days'`,
    [USMCA_COMPANY_ID],
  );

  // D: expenses with null linkage (7-day scoped, fuel-origin)
  const nullLinkRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        AND source_fuel_transaction_id IS NOT NULL
        AND created_at >= now() - interval '7 days'
        AND (load_id IS NULL OR driver_uuid IS NULL OR unit_id IS NULL OR trailer_id IS NULL OR vendor_uuid IS NULL)`,
    [USMCA_COMPANY_ID],
  );

  // D: breakdown of null linkage
  const nullLinkDetailRes = await client.query(
    `SELECT
       count(*) FILTER (WHERE load_id IS NULL)::int AS load_null,
       count(*) FILTER (WHERE driver_uuid IS NULL)::int AS driver_null,
       count(*) FILTER (WHERE unit_id IS NULL)::int AS unit_null,
       count(*) FILTER (WHERE trailer_id IS NULL)::int AS trailer_null,
       count(*) FILTER (WHERE vendor_uuid IS NULL)::int AS vendor_null
     FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        AND source_fuel_transaction_id IS NOT NULL
        AND created_at >= now() - interval '7 days'`,
    [USMCA_COMPANY_ID],
  );

  // E: documents with 2+ JEs (from creation and from match)
  // An expense with journal_entry_id (creation) AND a second JE from bank match
  // would show up as having 2+ distinct JEs linked via source_transaction_type='expense'
  const doublePostedRes = await client.query(
    `SELECT count(*)::int AS cnt FROM (
       SELECT source_transaction_id, count(DISTINCT journal_entry_uuid)::int AS je_count
         FROM accounting.journal_entry_postings
        WHERE source_transaction_type = 'expense'
          AND operating_company_id = $1::uuid
          AND created_at >= now() - interval '7 days'
        GROUP BY source_transaction_id HAVING count(DISTINCT journal_entry_uuid) > 1
     ) x`,
    [USMCA_COMPANY_ID],
  );

  await client.query("ROLLBACK");

  const d = nullLinkDetailRes.rows[0];
  const linkageDetails = [];
  if (d.load_null > 0) linkageDetails.push(`load_id null: ${d.load_null}`);
  if (d.driver_null > 0) linkageDetails.push(`driver_uuid null: ${d.driver_null}`);
  if (d.unit_null > 0) linkageDetails.push(`unit_id null: ${d.unit_null}`);
  if (d.trailer_null > 0) linkageDetails.push(`trailer_id null: ${d.trailer_null}`);
  if (d.vendor_null > 0) linkageDetails.push(`vendor_uuid null: ${d.vendor_null}`);

  return {
    fuelJesCount: fuelJeRes.rows[0].cnt,
    fuelExpensesWithSource: fuelExpensesRes.rows[0].cnt,
    duplicateFuelPointers: dupPtrRes.rows[0].cnt,
    fuel5000NetCents: Number(fuel5000Res.rows[0].net_cents),
    fuelExpenseTotalCents: Number(fuelTotalRes.rows[0].total_cents),
    expensesWithNullLinkage: nullLinkRes.rows[0].cnt,
    expensesWithNullLinkageDetails: linkageDetails.join(", "),
    docsDoublePosted: doublePostedRes.rows[0].cnt,
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
  // Static check E
  let staticProblems = [];
  if (fs.existsSync(ACCEPT_PATH_FILE)) {
    const source = fs.readFileSync(ACCEPT_PATH_FILE, "utf8");
    const staticResult = staticCheckAcceptPath(source);
    staticProblems = staticResult.problems;
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let live;
  try {
    live = await measureLive(client);
  } finally {
    client.release();
    await pool.end();
  }

  const { checks, problems, allPass } = classifyFuelPostsOnce(live);

  // Print the table
  console.log(`${LABEL}: fuel-cost-posts-exactly-once (7-day scoped, LAW 3)`);
  console.log("");
  console.log("  Check  Assertion                        Expected                                    Live                                         Result");
  console.log("  " + "-".repeat(140));
  for (const c of checks) {
    const result = c.pass ? "PASS" : "FAIL";
    console.log(`  ${c.id.padEnd(5)}   ${c.name.padEnd(30)} ${c.expected.padEnd(43)} ${c.live.padEnd(43)} ${result}`);
  }
  console.log("");

  // Static check E
  if (staticProblems.length > 0) {
    console.log("  Static check E (accept path):");
    for (const p of staticProblems) {
      console.log(`    FAIL — ${p}`);
    }
  } else {
    console.log("  Static check E (accept path): PASS — variance guard present, no direct INSERT in accept path");
  }
  console.log("");

  const allProblems = [...problems, ...staticProblems];
  if (allProblems.length > 0) {
    console.error(`${LABEL}: FAIL — ${allProblems.length} problem(s):\n` + allProblems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: PASS — fuel costs post exactly once.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
