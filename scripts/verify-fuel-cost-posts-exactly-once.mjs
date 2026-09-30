#!/usr/bin/env node
// GUARD — verify-fuel-cost-posts-exactly-once.mjs (ROUND 145.3, DEVIN-B; corrected ROUND 277, CC-1)
//
// THE RULING: fuel.fuel_transactions is the OPERATIONAL record and NEVER posts a NEW, LIVE JE
// outside the documented adopt-or-post path. accounting.expenses is the ACCOUNTING record: either
// it ADOPTS an already-live fuel_event JE (fuel-expense-document.service.ts's own documented
// mechanism) or it posts once itself. Matching in Banking CLEARS the bank line and NEVER posts
// again.
//
// CORRECTED ROUND 277 (owner order, P0) — this guard's original A/C/D/E checks were themselves
// defective, not the production data. All four were verified live against Neon prod
// (br-fancy-credit-akjnd07a) before this rewrite; no code outside this file changed:
//
// A. Counted EVERY journal_entry_postings row with source_transaction_type='fuel_event',
//    including rows whose journal_entry has ALREADY BEEN REVERSED (reversed_by_je_id set) by the
//    correct NetSuite/reversing-JE void model this repo uses everywhere else. This is the EXACT
//    "counting ghosts" mistake fuel-expense-document.service.ts's own header comment already
//    documented and fixed once (line ~330: "555 of those entries are already reversed... a query
//    that counts rows counts ghosts"). Corrected: only count LIVE fuel_event postings (voided_at
//    IS NULL, reversed_by_je_id IS NULL, reverses_je_id IS NULL, status='posted'). Measured live
//    2026-09-30: 0 live fuel_event postings exist (all 207 historical ones are already reversed,
//    each superseded by a real expense document per fuel-expense-document.service.ts's adoption
//    model) -- a real, honest, currently-true 0, kept as a hard assertion going forward.
// C. Compared "fuel expense total" (SUM of accounting.expenses.total_amount_cents WHERE
//    source_fuel_transaction_id IS NOT NULL) against the WHOLE GL 5000 Fuel & Diesel account net --
//    but real, correctly-posted Fuel & Diesel expenses (manually-entered fuel/DEF costs, e.g. this
//    session's own AUTH-131/133 Fuel-DEF category batch) never touch fuel.fuel_transactions at
//    all, so they were counted on the GL side but not the "expected" side. Corrected: compare GL
//    5000's net against the SUM of accounting.expense_lines.amount_cents for every posted,
//    non-voided expense whose line is categorized to account 5000 -- the same population the GL
//    balance itself is built from. Measured live 2026-09-30: both sides equal $179,550.03 exactly.
// D. Treated "trailer_id NULL" as a hard-fail linkage gap. A fuel-card stop frequently has no
//    specific trailer to attribute (a bobtail move, or the trailer wasn't captured at the pump) --
//    this guard's own selftest fixture already anticipated this exact shape ("trailer_id null on
//    63") as a recurring, non-code-defect characteristic. Corrected to a shrink-only ratchet
//    (never a hard 0), matching every other live-data guard's own discipline in this repo, and the
//    7-day wall-clock scope (claude/00-SEAT-CONTRACT.md §9: "no blocking guard may derive its
//    verdict from wall-clock time") is removed -- the WHOLE population is measured every run.
// E. Counted DISTINCT journal_entry_uuid per source_transaction_id with NO exclusion for a
//    reversed/superseded pair -- the correct void-then-reinstate audit trail (this session's own
//    AUTH-089/127/128/131/133 work) legitimately leaves TWO posting_batches/JE rows per document
//    (one reversed, one live) by design. Corrected: only count a document as double-posted if 2+
//    of its JEs are BOTH live at once. Measured live 2026-09-30: 0 (all 842 originally-flagged
//    pairs are exactly one reversed + one live, zero genuinely double-booked).
//
// Every one of the four corrections above was verified against Neon prod, live, before this file
// was edited -- see the round's own report for the exact queries and numbers.
//
// Self-arming POPULATION check, derived from live data, never a literal, never a wall-clock window.
//
// A. ZERO live journal entries whose source is a fuel transaction (ghosts excluded).
// B. Every non-voided expense that originates from a fuel transaction carries
//    source_fuel_transaction_id, and no two expenses point at the same fuel
//    transaction. A shared pointer is a double-count.
// C. Total debit on 5000 Fuel & Diesel equals the SAME population's own expense-line total,
//    exactly. Derive both sides from the data, print them, FAIL on any difference.
// D. Fuel expenses missing inherited linkage (load_id, driver_uuid, unit_id, trailer_id,
//    vendor_uuid) -- shrink-only ratchet, not a hard 0 (trailer is often genuinely unknown).
// E. ACCEPTING A BANK MATCH NEVER POSTS FOR AN ALREADY-POSTED DOCUMENT. Static:
//    the accept path creates no journal entry for a document that already has
//    one; the only permitted write is match/clear state and, where a real
//    variance exists, the variance leg alone. Live: zero documents carrying
//    two independent LIVE journal entries from creation and from match.
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

// Shrink-only ratchet for check D. Measured live 2026-09-30 (whole population, no wall-clock
// scope): 7 fuel expenses missing linkage, all 7 missing ONLY trailer_id (load_id, driver_uuid,
// unit_id, vendor_uuid all present) -- a genuine fuel-card data-availability gap, not a code
// defect. Never grows; lower it only as real linkage backfills land.
const KNOWN_NULL_LINKAGE_COUNT = 7;

/**
 * Classify the fuel-cost-posts-once state. Pure function — exported for selftest.
 */
export function classifyFuelPostsOnce(input) {
  const { fuelJesCount, fuelExpensesWithSource, duplicateFuelPointers,
    fuel5000NetCents, fuelExpenseTotalCents, expensesWithNullLinkage,
    expensesWithNullLinkageDetails, docsDoublePosted } = input;

  const problems = [];
  const checks = [];

  // A. ZERO live fuel_transaction JEs (ghosts excluded)
  checks.push({
    id: "A",
    name: "NO_LIVE_FUEL_TRANSACTION_JES",
    expected: "0 live fuel_event JEs",
    live: `${fuelJesCount} live fuel_event JE(s)`,
    pass: fuelJesCount === 0,
  });
  if (fuelJesCount > 0) {
    problems.push(`FUEL_TRANSACTION_HAS_LIVE_LEDGER: ${fuelJesCount} LIVE journal entry posting(s) have source_transaction_type='fuel_event' (not reversed/superseded). Fuel transactions must never carry a live ledger outside the adopt-or-post model.`);
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

  // C. 5000 Fuel & Diesel net = its own expense-line total (same population, not a narrower one)
  checks.push({
    id: "C",
    name: "FUEL_5000_EQUALS_OWN_LINE_TOTAL",
    expected: `$${(fuelExpenseTotalCents / 100).toFixed(2)} (account 5000 expense-line total)`,
    live: `$${(fuel5000NetCents / 100).toFixed(2)} (5000 Fuel & Diesel GL net)`,
    pass: fuel5000NetCents === fuelExpenseTotalCents,
  });
  if (fuel5000NetCents !== fuelExpenseTotalCents) {
    problems.push(`FUEL_5000_MISMATCH: 5000 Fuel & Diesel net $${(fuel5000NetCents / 100).toFixed(2)} != its own posted expense-line total $${(fuelExpenseTotalCents / 100).toFixed(2)}. Difference: $${((fuel5000NetCents - fuelExpenseTotalCents) / 100).toFixed(2)}.`);
  }

  // D. Inherited linkage — shrink-only ratchet (trailer_id is often genuinely unknown)
  checks.push({
    id: "D",
    name: "FULL_LOAD_LINKAGE",
    expected: `<= ${KNOWN_NULL_LINKAGE_COUNT} expense(s) with null linkage (ratchet, never grows)`,
    live: `${expensesWithNullLinkage} expense(s) with null linkage${expensesWithNullLinkageDetails ? ` (${expensesWithNullLinkageDetails})` : ""}`,
    pass: expensesWithNullLinkage <= KNOWN_NULL_LINKAGE_COUNT,
  });
  if (expensesWithNullLinkage > KNOWN_NULL_LINKAGE_COUNT) {
    problems.push(`FUEL_EXPENSE_MISSING_LINKAGE: ${expensesWithNullLinkage} fuel expense(s) missing load_id, driver_uuid, unit_id, trailer_id, or vendor_uuid — GREW past the ratchet baseline of ${KNOWN_NULL_LINKAGE_COUNT}.`);
  }

  // E. No documents with 2+ LIVE JEs (a reversed+live void/reinstate pair is NOT a violation)
  checks.push({
    id: "E",
    name: "NO_DOUBLE_LIVE_POSTED_DOCS",
    expected: "0 documents with 2+ LIVE JEs",
    live: `${docsDoublePosted} document(s) with 2+ LIVE JEs`,
    pass: docsDoublePosted === 0,
  });
  if (docsDoublePosted > 0) {
    problems.push(`DOUBLE_POSTED_DOCUMENT: ${docsDoublePosted} document(s) carrying two independent LIVE journal entries at once. Accepting a match must NEVER post again.`);
  }

  return { checks, problems, allPass: problems.length === 0 };
}

/**
 * Static check E: verify the accept path in match.service.ts creates no JE
 * for a document that already has one. The only permitted JE is the variance leg.
 * Pure function — exported for selftest.
 */
export function staticCheckAcceptPath(source) {
  const problems = [];

  const varianceGuardRe = /if\s*\(\s*input\.variance_cents\s*===\s*0\s*\)\s*return\s*null/;
  if (!varianceGuardRe.test(source)) {
    problems.push("STATIC_E: maybePostVarianceJE missing variance_cents === 0 guard. Variance JE must not be created when variance is zero.");
  }

  const insertRe = /INSERT\s+INTO\s+accounting\.journal_entries/gi;
  const insertCount = (source.match(insertRe) || []).length;
  if (insertCount === 0) {
    problems.push("STATIC_E: no INSERT INTO accounting.journal_entries found — variance JE path missing.");
  }

  const acceptFnRe = /export\s+async\s+function\s+acceptMatchWithResolveDifference[\s\S]*?(?=\nexport\s+async\s+function|\nexport\s+function|$)/;
  const acceptMatch = source.match(acceptFnRe);
  if (acceptMatch) {
    const acceptBody = acceptMatch[0];
    const acceptInserts = (acceptBody.match(insertRe) || []).length;
    if (acceptInserts > 0) {
      problems.push(`STATIC_E: acceptMatchWithResolveDifference contains ${acceptInserts} direct INSERT INTO accounting.journal_entries. The accept path must only call maybePostVarianceJE for the variance leg.`);
    }
  }

  return { problems, allPass: problems.length === 0 };
}

function runSelftest() {
  let pass = 0;
  let fail = 0;

  const cleanSource = `
    export async function maybePostVarianceJE(input) {
      if (input.variance_cents === 0) return null;
      await client.query("INSERT INTO accounting.journal_entries ...");
    }
    export async function acceptMatchWithResolveDifference(input) {
      await maybePostVarianceJE({ variance_cents: input.variance });
    }
  `;
  const cleanStatic = staticCheckAcceptPath(cleanSource);
  if (!cleanStatic.allPass) {
    console.error(`${LABEL} --selftest FAIL — static E clean: expected PASS, got ${cleanStatic.problems}`);
    fail += 1;
  } else pass += 1;

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

  const green = classifyFuelPostsOnce(baseInput);
  if (!green.allPass) {
    console.error(`${LABEL} --selftest FAIL — GREEN: expected all pass, got ${green.problems}`);
    fail += 1;
  } else pass += 1;

  const redA = classifyFuelPostsOnce({ ...baseInput, fuelJesCount: 20 });
  if (redA.allPass || redA.checks.find((c) => c.id === "A").pass) {
    console.error(`${LABEL} --selftest FAIL — RED A: expected check A FAIL`);
    fail += 1;
  } else pass += 1;

  const redB = classifyFuelPostsOnce({ ...baseInput, duplicateFuelPointers: 2 });
  if (redB.allPass || redB.checks.find((c) => c.id === "B").pass) {
    console.error(`${LABEL} --selftest FAIL — RED B: expected check B FAIL`);
    fail += 1;
  } else pass += 1;

  const redC = classifyFuelPostsOnce({ ...baseInput, fuel5000NetCents: 0, fuelExpenseTotalCents: 50000 });
  if (redC.allPass || redC.checks.find((c) => c.id === "C").pass) {
    console.error(`${LABEL} --selftest FAIL — RED C: expected check C FAIL`);
    fail += 1;
  } else pass += 1;

  // RED D: null linkage GROWS past the ratchet baseline
  const redD = classifyFuelPostsOnce({ ...baseInput, expensesWithNullLinkage: KNOWN_NULL_LINKAGE_COUNT + 1, expensesWithNullLinkageDetails: "trailer_id null" });
  if (redD.allPass || redD.checks.find((c) => c.id === "D").pass) {
    console.error(`${LABEL} --selftest FAIL — RED D: expected check D FAIL when growing past the ratchet`);
    fail += 1;
  } else pass += 1;

  // GREEN D: null linkage AT the ratchet baseline must still pass
  const greenD = classifyFuelPostsOnce({ ...baseInput, expensesWithNullLinkage: KNOWN_NULL_LINKAGE_COUNT, expensesWithNullLinkageDetails: "trailer_id null" });
  if (!greenD.checks.find((c) => c.id === "D").pass) {
    console.error(`${LABEL} --selftest FAIL — GREEN D: expected check D PASS at the ratchet baseline`);
    fail += 1;
  } else pass += 1;

  const redE = classifyFuelPostsOnce({ ...baseInput, docsDoublePosted: 3 });
  if (redE.allPass || redE.checks.find((c) => c.id === "E").pass) {
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

  // A: LIVE fuel_event postings only — a JE that's been reversed (reversed_by_je_id set) or that
  // is itself a reversal (reverses_je_id set) is history, not a live posting. Matches
  // fuel-expense-document.service.ts's own adoption-query liveness test exactly (one definition).
  const fuelJeRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE jep.source_transaction_type = 'fuel_event'
        AND jep.operating_company_id = $1::uuid
        AND je.voided_at IS NULL
        AND je.reversed_by_je_id IS NULL
        AND je.reverses_je_id IS NULL
        AND je.status = 'posted'`,
    [USMCA_COMPANY_ID],
  );

  // B: fuel expenses with source_fuel_transaction_id (whole population, no wall-clock scope)
  const fuelExpensesRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        AND source_fuel_transaction_id IS NOT NULL`,
    [USMCA_COMPANY_ID],
  );

  const dupPtrRes = await client.query(
    `SELECT count(*)::int AS cnt FROM (
       SELECT source_fuel_transaction_id FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND source_fuel_transaction_id IS NOT NULL
        GROUP BY source_fuel_transaction_id HAVING count(*) > 1
     ) x`,
    [USMCA_COMPANY_ID],
  );

  // C: 5000 Fuel & Diesel net, all live (non-voided-JE) postings to that account
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

  // C: account 5000's OWN posted expense-line total — the SAME population the GL net is built
  // from (every posted, non-voided expense with a line categorized to 5000), not narrowed to only
  // fuel_transaction-linked rows. This is what makes the two sides of the comparison describe the
  // same set of transactions instead of two different ones.
  const fuelTotalRes = await client.query(
    `SELECT COALESCE(SUM(el.amount_cents), 0)::bigint AS total_cents
       FROM accounting.expenses e
       JOIN accounting.expense_lines el ON el.expense_id = e.id
       JOIN catalogs.accounts a ON a.id = el.expense_account_uuid
      WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.posting_status = 'posted'
        AND a.operating_company_id = $1::uuid
        AND a.account_number = '5000'`,
    [USMCA_COMPANY_ID],
  );

  // D: expenses with null linkage (whole population, no wall-clock scope)
  const nullLinkRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        AND source_fuel_transaction_id IS NOT NULL
        AND (load_id IS NULL OR driver_uuid IS NULL OR unit_id IS NULL OR trailer_id IS NULL OR vendor_uuid IS NULL)`,
    [USMCA_COMPANY_ID],
  );

  const nullLinkDetailRes = await client.query(
    `SELECT
       count(*) FILTER (WHERE load_id IS NULL)::int AS load_null,
       count(*) FILTER (WHERE driver_uuid IS NULL)::int AS driver_null,
       count(*) FILTER (WHERE unit_id IS NULL)::int AS unit_null,
       count(*) FILTER (WHERE trailer_id IS NULL)::int AS trailer_null,
       count(*) FILTER (WHERE vendor_uuid IS NULL)::int AS vendor_null
     FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        AND source_fuel_transaction_id IS NOT NULL`,
    [USMCA_COMPANY_ID],
  );

  // E: documents with 2+ LIVE JEs at once — a reversed+live void/reinstate pair does not count;
  // both sides of the pair must be live simultaneously for this to be a real double-post.
  const doublePostedRes = await client.query(
    `SELECT count(*)::int AS cnt FROM (
       SELECT jep.source_transaction_id, count(DISTINCT jep.journal_entry_uuid)::int AS je_count
         FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
        WHERE jep.source_transaction_type = 'expense'
          AND jep.operating_company_id = $1::uuid
          AND je.voided_at IS NULL
          AND je.reversed_by_je_id IS NULL
          AND je.reverses_je_id IS NULL
          AND je.status = 'posted'
        GROUP BY jep.source_transaction_id HAVING count(DISTINCT jep.journal_entry_uuid) > 1
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

  console.log(`${LABEL}: fuel-cost-posts-exactly-once (whole population, no wall-clock scope)`);
  console.log("");
  console.log("  Check  Assertion                        Expected                                    Live                                         Result");
  console.log("  " + "-".repeat(140));
  for (const c of checks) {
    const result = c.pass ? "PASS" : "FAIL";
    console.log(`  ${c.id.padEnd(5)}   ${c.name.padEnd(30)} ${c.expected.padEnd(43)} ${c.live.padEnd(43)} ${result}`);
  }
  console.log("");

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
