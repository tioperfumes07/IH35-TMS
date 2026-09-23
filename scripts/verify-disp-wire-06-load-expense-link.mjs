#!/usr/bin/env node
/**
 * RATCHET — verify-disp-wire-06-load-expense-link (CLS-DISP-WIRE-06 · ACCT-F126)
 *
 * THE RULE: every cost the TMS itself creates must name the load it belongs to. Per-load margin is
 * only as honest as this link — a diesel or repair cost floating free is money the load never shows.
 *
 * WHAT THIS RATCHET REFUSES TO DO, AND WHY THAT IS THE DESIGN. The obvious version — "every
 * fuel.fuel_transactions row must have load_id" — is RED on 1,552 of 1,552 rows on prod today, and
 * every one of those is CORRECT. They are pre-TMS-dispatch imports: the TMS had not dispatched a
 * load when they happened, so there is no load to point at, and the owner ruled them expected state
 * (LOAD-LINKAGE-SCOPE-RULING-2026-08-04). A guard that fires on all of them would be switched off
 * within a day, and the class would stay open — which is exactly how it stayed open until now.
 *
 * SO IT KEYS OFF THE DISCRIMINATOR, NOT THE COUNT. `fuel.fuel_transactions.load_required` says
 * whether this specific row is one the TMS should have linked:
 *   · load_required = false  → import-origin / legitimately load-less. NEVER a violation.
 *   · load_required = true   → TMS-native cost. It MUST carry load_id.
 * That column only became trustworthy in this same PR. The relay bridge used to hardcode
 * load_required = true while simultaneously writing load_exemption_reason = 'relay_ingest_no_load_link'
 * — a row asserting both "a load is required" and "here is why it is exempt" — so four prod rows
 * (2026-08-05) contradicted themselves and every future relay ingest would mint another. The bridge
 * now derives both from the same resolveLoadId result, and migration 202612160000 reconciled the
 * four. Without that fix this guard would be red on arrival.
 *
 * ALSO ASSERTED: expense_attribution.expense_load_links must not contain an orphan — a link row whose
 * load no longer exists is a per-load cost attributed to nothing.
 *
 * DEGRADE-SAFE: no reachable database → SKIP, exit 0 (the established pattern, cf.
 * verify-balanced-ledger.mjs). Honest limitation: CI's database is a fresh ephemeral one with no fuel
 * rows, so this is VACUOUS there. Its teeth are live — GUARD/CC-2 runs it against prod.
 */
import fs from "node:fs";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LABEL = "verify-disp-wire-06-load-expense-link";

/**
 * TMS-native fuel costs missing their load. Import-origin rows are excluded by load_required=false
 * rather than by a hardcoded date or id list, so the exclusion cannot rot.
 */
export const FUEL_UNLINKED_SQL = `
  SELECT id::text AS id, COALESCE(transaction_reference,'') AS ref, operating_company_id::text AS opco
    FROM fuel.fuel_transactions
   WHERE load_required = true
     AND load_id IS NULL`;

/** A link row pointing at a load that does not exist — attribution to nothing. */
export const ORPHAN_LINK_SQL = `
  SELECT l.id::text AS id, l.load_id::text AS load_id
    FROM expense_attribution.expense_load_links l
   WHERE NOT EXISTS (SELECT 1 FROM mdata.loads m WHERE m.id = l.load_id)`;

/** Contradiction check: a row cannot both require a load and carry a reason for not having one. */
export const CONTRADICTION_SQL = `
  SELECT id::text AS id, load_exemption_reason
    FROM fuel.fuel_transactions
   WHERE load_id IS NULL
     AND load_required = true
     AND load_exemption_reason IS NOT NULL`;

if (process.argv.includes("--selftest")) {
  // The SQL is the guard, so the selftest asserts the properties that make it correct rather than
  // re-running it against a database it may not have.
  // Mutation 1: the fuel query must be scoped by load_required. Without it the guard fires on 1,552
  // legitimately load-less imports and gets disabled.
  if (!/load_required\s*=\s*true/.test(FUEL_UNLINKED_SQL)) {
    console.error(`${LABEL} --selftest FAIL — fuel query is not scoped to load_required=true; it would fire on import-origin rows.`);
    process.exit(1);
  }
  // Mutation 2: it must still require the link to be missing, or it asserts nothing.
  if (!/load_id\s+IS\s+NULL/.test(FUEL_UNLINKED_SQL)) {
    console.error(`${LABEL} --selftest FAIL — fuel query does not test for a missing load_id.`);
    process.exit(1);
  }
  // Mutation 3: the orphan check must verify against the CANONICAL loads table (mdata.loads, §10),
  // not a retire table.
  if (!/mdata\.loads/.test(ORPHAN_LINK_SQL)) {
    console.error(`${LABEL} --selftest FAIL — orphan check does not resolve against canonical mdata.loads.`);
    process.exit(1);
  }
  // Mutation 4: the contradiction check must look for the load_required/exemption-reason pair — the
  // defect that made load_required untrustworthy in the first place.
  if (!/load_exemption_reason\s+IS\s+NOT\s+NULL/.test(CONTRADICTION_SQL) || !/load_required\s*=\s*true/.test(CONTRADICTION_SQL)) {
    console.error(`${LABEL} --selftest FAIL — contradiction check does not detect load_required=true alongside an exemption reason.`);
    process.exit(1);
  }
  // Mutations 5-6 (LV-TXN-013) are BEHAVIOURAL, and deliberately not source-greps.
  //
  // My first attempt at these two asserted against this file's own text -- /NOT EXERCISED/.test(self)
  // and /loopback/.test(self). Both were DEAD ON ARRIVAL and I only found out by trying to break
  // them: renaming NOT EXERCISED to PASS everywhere also rewrote the regex that was supposed to
  // catch it, and `loopback` kept matching the prose in the comment above rather than any code. A
  // guard that reads its own source cannot mutation-test itself -- the mutation edits the assertion
  // too. So both now call the real functions with real inputs.

  // 5: zero rows examined must NOT be reported as a pass. This guard was green in CI its whole life
  // because "nothing to check" printed the same word as "checked, all clean".
  const empty = describeCorpus(0, "");
  const clean = describeCorpus(7, "");
  if (empty.verdict === "PASS") {
    console.error(`${LABEL} --selftest FAIL — an EMPTY corpus is reported as PASS (LV-TXN-013).`);
    process.exit(1);
  }
  if (clean.verdict !== "PASS") {
    console.error(`${LABEL} --selftest FAIL — a genuinely clean non-empty corpus is not reported as PASS.`);
    process.exit(1);
  }

  // 6: fixture planting must be refused anywhere but a throwaway loopback scratch DB.
  const allowed = "postgres://verify:verify@localhost:54329/ih35_verify";
  const refused = [
    "postgres://u:p@ep-fancy-credit-akjnd07a.us-east-2.aws.neon.tech/neondb",
    "postgres://u:p@10.0.0.5:5432/ih35_verify",
    "postgres://u:p@localhost:5432/neondb",
  ];
  if (!isEphemeralTarget(allowed)) {
    console.error(`${LABEL} --selftest FAIL — the local CI scratch DB is refused; the exercise can never run.`);
    process.exit(1);
  }
  for (const r of refused) {
    if (isEphemeralTarget(r)) {
      console.error(`${LABEL} --selftest FAIL — would plant fixture rows into ${r}. Refusal is not unconditional.`);
      process.exit(1);
    }
  }

  console.log(
    `${LABEL} --selftest PASS — 6 checks (4 scope mutations + empty-corpus is not a pass + fixture ` +
      `planting refused on 3 non-ephemeral targets incl. the prod host).`
  );
  process.exit(0);
}

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.log(`${LABEL} SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live linkage cannot be asserted here.`);
  process.exit(0);
}

const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const pg = require("pg");
const client = new pg.Client(buildPgClientConfig(connectionString));

try {
  await client.connect();
} catch (error) {
  // DEGRADE-SAFE on UNREACHABLE, not merely on unset. verify-static deliberately points every guard
  // at a dead sentinel (127.0.0.1:59999) to prove none can touch a real database; treating that as a
  // failure would make this guard the thing that blocks every push. A connection failure is not
  // evidence of a linkage defect — a query failure below still is.
  console.log(`${LABEL} SKIP — database unreachable (${error.code ?? error.message}); live assertion not possible here.`);
  await client.end().catch(() => {});
  process.exit(0);
}

/**
 * Prove the detection SQL actually fires, by planting a violation and requiring it to be caught.
 *
 * REFUSES TO RUN unless the target is unmistakably a throwaway local database: the host must be
 * loopback AND the database name must look like a verify/test scratch DB. Anything else -- any
 * remote host, prod, a branch, a developer's real DB -- is declined, loudly, and the caller falls
 * back to reporting the live half as un-exercised. Belt and braces: the whole thing runs inside a
 * transaction that is ALWAYS rolled back, so even on the ephemeral DB no row survives.
 *
 * Without this, the queries below are never executed against a single matching row anywhere in CI.
 */
function isEphemeralTarget(connStr) {
  let host = "";
  let dbname = "";
  try {
    const u = new URL(connStr);
    host = u.hostname;
    dbname = u.pathname.replace(/^\//, "");
  } catch {
    return false;
  }
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const isScratch = /verify|test/i.test(dbname);
  return isLoopback && isScratch;
}

/**
 * Decide how to REPORT the live half. Split out so the selftest can call it with a zero corpus and
 * prove that "examined nothing" never renders as PASS — the whole of LV-TXN-013.
 */
function describeCorpus(corpus, exercised) {
  if (corpus === 0) {
    return {
      verdict: "NOT EXERCISED",
      text:
        `${LABEL} NOT EXERCISED — 0 TMS-native fuel rows (load_required=true) in this database, so the ` +
        `linkage assertion evaluated an EMPTY SET and proves nothing about linkage here. This is the ` +
        `expected state in CI, whose database is built from migrations and holds no production rows; ` +
        `the only environment where the live half means anything is prod. ${exercised}`,
    };
  }
  return {
    verdict: "PASS",
    text:
      `${LABEL} PASS — ${corpus} TMS-native fuel cost(s) examined, every one carries its load, no ` +
      `load_required/exemption contradictions, and no orphaned expense→load links. Import-origin ` +
      `rows (load_required=false) are expected state and are not counted. ${exercised}`,
  };
}

async function exerciseDetectionOnEphemeralDb(c) {
  if (!isEphemeralTarget(connectionString)) {
    return "Detection-exercise DECLINED — target is not an ephemeral local scratch database; refusing to plant rows.";
  }

  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const opco = (
      await c.query(`SELECT id::text AS id FROM org.companies WHERE is_active = true LIMIT 1`)
    ).rows[0]?.id;
    if (!opco) {
      await c.query("ROLLBACK");
      return "Detection-exercise SKIPPED — no active company row to scope a fixture to.";
    }

    // Violation 1: TMS-native fuel cost with no load.
    const planted = await c.query(
      `INSERT INTO fuel.fuel_transactions (operating_company_id, load_required, load_id, transaction_reference)
       VALUES ($1::uuid, true, NULL, 'LV-TXN-013-FIXTURE')
       RETURNING id::text AS id`,
      [opco]
    );
    const caughtUnlinked = (await c.query(FUEL_UNLINKED_SQL)).rows.some((r) => r.id === planted.rows[0].id);

    // Violation 2: load_required=true alongside an exemption reason (the contradiction).
    await c.query(
      `UPDATE fuel.fuel_transactions SET load_exemption_reason = 'LV-TXN-013-FIXTURE' WHERE id = $1::uuid`,
      [planted.rows[0].id]
    );
    const caughtContradiction = (await c.query(CONTRADICTION_SQL)).rows.some(
      (r) => r.id === planted.rows[0].id
    );

    await c.query("ROLLBACK");

    if (!caughtUnlinked || !caughtContradiction) {
      const missed = [
        !caughtUnlinked && "unlinked TMS-native fuel cost",
        !caughtContradiction && "load_required/exemption contradiction",
      ]
        .filter(Boolean)
        .join(" + ");
      console.error(
        `${LABEL} FAIL — detection-exercise: a planted violation was NOT caught (${missed}). The live ` +
          `query does not detect the defect it claims to; a clean run against real data would mean nothing.`
      );
      process.exit(1);
    }
    return "Detection-exercise PASSED — 2 planted violations caught and rolled back (live SQL proven, not assumed).";
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    return `Detection-exercise SKIPPED — fixture could not be planted (${e.message.split("\n")[0]}).`;
  }
}

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const unlinked = (await client.query(FUEL_UNLINKED_SQL)).rows;
  const contradictions = (await client.query(CONTRADICTION_SQL)).rows;
  let orphans = [];
  const linksPresent = (await client.query(`SELECT to_regclass('expense_attribution.expense_load_links') AS t`)).rows[0]?.t;
  if (linksPresent) orphans = (await client.query(ORPHAN_LINK_SQL)).rows;
  await client.query("COMMIT");

  const problems = [];
  for (const r of unlinked) {
    problems.push(
      `fuel.fuel_transactions ${r.ref || r.id} (${r.id}, entity ${r.opco}) is TMS-native ` +
        `(load_required=true) but carries no load_id — a cost no load will ever show.`
    );
  }
  for (const r of contradictions) {
    problems.push(
      `fuel.fuel_transactions ${r.id} claims load_required=true AND carries ` +
        `load_exemption_reason='${r.load_exemption_reason}'. A row cannot both need a load and be ` +
        `exempt from having one; the writer is setting the pair inconsistently.`
    );
  }
  for (const r of orphans) {
    problems.push(
      `expense_attribution.expense_load_links ${r.id} points at load ${r.load_id}, which does not ` +
        `exist in mdata.loads — an expense attributed to nothing.`
    );
  }

  if (problems.length > 0) {
    console.error(`${LABEL} FAIL — ${problems.length} load-linkage problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `  Do NOT resolve this by inventing a load_id. Load linkage is going-forward only ` +
        `(LOAD-LINKAGE-SCOPE-RULING-2026-08-04); if a row is genuinely import-origin, the correct fix ` +
        `is load_required=false with an exemption reason, set by the ingest path — not a fabricated FK.`
    );
    process.exit(1);
  }
  // LV-TXN-013 — A CLEAN RESULT OVER AN EMPTY TABLE IS NOT A PASS.
  //
  // In CI this script DOES connect: ci.yml supplies a DATABASE_URL, so the SKIP branch above never
  // fires. But that database is a fresh ephemeral instance built from migrations, and migrations
  // create schema, not rows. All three queries returned zero rows because there was NOTHING TO
  // EXAMINE -- and the script printed PASS. The live half has therefore been vacuously green in
  // every CI run since it was wired, and could never have observed a regression.
  //
  // Two fixes, because either alone is insufficient:
  //   (1) SAY SO. An empty corpus is reported as NOT EXERCISED, never as PASS. Still exit 0 -- CI
  //       legitimately has no production data and a permanently-red guard gets muted -- but the
  //       output no longer claims an assurance it did not earn.
  //   (2) PROVE THE QUERIES actually detect what they claim, by planting each violation and
  //       requiring it to be caught. This runs ONLY against an unmistakably ephemeral local
  //       database and ALWAYS rolls back, so the detection logic is exercised for real in CI
  //       without any row ever surviving.
  const corpus = (
    await client.query(
      `SELECT count(*)::int AS n FROM fuel.fuel_transactions WHERE load_required = true`
    )
  ).rows[0]?.n ?? 0;

  const exercised = await exerciseDetectionOnEphemeralDb(client);
  console.log(describeCorpus(corpus, exercised).text);
} catch (error) {
  console.error(`${LABEL} FAIL — ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
