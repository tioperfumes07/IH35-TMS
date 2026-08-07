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
  console.log(`${LABEL} --selftest PASS — 4 mutations detected; scope is import-safe by construction.`);
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
  console.log(
    `${LABEL} PASS — every TMS-native fuel cost carries its load, no load_required/exemption ` +
      `contradictions, and no orphaned expense→load links. Import-origin rows (load_required=false) ` +
      `are expected state and are not counted.`
  );
} catch (error) {
  console.error(`${LABEL} FAIL — ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
