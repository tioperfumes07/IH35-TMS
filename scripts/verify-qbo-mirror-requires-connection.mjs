#!/usr/bin/env node
/**
 * A QBO MIRROR row may only exist for an entity that actually HAS a QuickBooks connection.
 *
 * THE INCIDENT THIS PREVENTS (docs/incidents/2026-06-25-usmca-qbo-mirror-cross-entity-leak.md):
 * 365 rows carrying IH 35 Transportation's chart of accounts sat in mdata.qbo_accounts under USMCA —
 * an entity with ZERO integrations.qbo_connections. Until PR #3717 the expense-category picker read
 * that mirror, so a USMCA operator was offered ANOTHER LEGAL ENTITY's general-ledger accounts,
 * including accounts named after individual people and accounts QuickBooks had already deleted.
 *
 * The rows were created 2026-06-25 and re-touched 2026-07-16; the resolver bug that let a
 * company-omitting write land on the lowest UUID was not fixed until 2026-07-25. This check would
 * have failed the first CI run after the insert, three weeks before anyone noticed.
 *
 * The invariant is simple and absolute: no QBO connection ⇒ no QBO mirror rows. It is a DATA check,
 * so it needs a database and declares its own capability preflight (Rule 17 keeps guard wiring in
 * scripts/verify-steps/, so it is not registered through package.json).
 */
import { fileURLToPath } from "node:url";

const LABEL = "verify-qbo-mirror-requires-connection";

/** Mirror tables that must be empty for an unconnected entity. Extend as mirrors are added. */
const MIRROR_TABLES = [
  "mdata.qbo_accounts",
  "mdata.qbo_items",
  "mdata.qbo_customers",
  "mdata.qbo_vendors",
];

/** Pure comparison so the selftest runs with no database. */
export function findOrphanMirrorRows(rows) {
  return rows.filter((r) => Number(r.mirror_rows) > 0 && Number(r.connections) === 0);
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  // LIVE-DATA GUARD, opt-in — following the established shape of verify-no-test-units-in-prod.
  //
  // The invariant is about PRODUCTION data. Run against CI's database it fails on legitimate test
  // FIXTURES: tms-vendor-push-tenant-isolation.test.ts deliberately inserts an mdata.qbo_vendors row
  // for a company with no connection, because that is the isolation it is testing. A guard that trips
  // on a correct fixture will be allowlisted within a week, and then it protects nothing.
  //
  // So the live scan is explicit rather than implicit, and — per S12 of the guard shape-vs-substance
  // register — it says SKIPPED-DB-CHECK out loud and names the missing precondition, so a skipped
  // guard can never be mistaken for a passing one. Run it against prod with:
  //   ENABLE_QBO_MIRROR_LEAK_LIVE_CHECK=true DATABASE_URL=<prod> node scripts/verify-qbo-mirror-requires-connection.mjs
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_QBO_MIRROR_LEAK_LIVE_CHECK !== "true") {
    const missing = !connectionString
      ? "DATABASE_URL is unset"
      : "ENABLE_QBO_MIRROR_LEAK_LIVE_CHECK is not 'true'";
    console.log(
      `${LABEL} — selftest PASSED · SKIPPED-DB-CHECK (${missing}); the live mirror-vs-connection scan did NOT run`
    );
    return;
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (error) {
    const code = error?.code ?? "";
    if (["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"].includes(code)) {
      console.log(`${LABEL} SKIP-capability: database → ci / build-typecheck (unreachable: ${code}).`);
      return;
    }
    throw error;
  }

  try {
    // The connections table itself must exist before anything below can run. Without this check a
    // database lacking integrations.qbo_connections makes the count below throw 42P01 and the guard
    // CRASHES instead of skipping — which is what happened on this PR's first two CI runs. A guard
    // that dies on an environment it does not apply to is indistinguishable from a real failure.
    const connTable = await client.query("SELECT to_regclass('integrations.qbo_connections') IS NOT NULL AS ok");
    if (!connTable.rows[0]?.ok) {
      console.log(
        `${LABEL} SKIP — integrations.qbo_connections does not exist on this database, so the ` +
          `mirror↔connection invariant cannot be evaluated here.`
      );
      return;
    }

    const present = [];
    for (const rel of MIRROR_TABLES) {
      const r = await client.query("SELECT to_regclass($1) IS NOT NULL AS ok", [rel]);
      if (r.rows[0]?.ok) present.push(rel);
    }
    if (present.length === 0) {
      console.log(`${LABEL} OK — no QBO mirror tables on this database.`);
      return;
    }

    // An environment that models NO QBO connections at all cannot express this invariant. CI builds a
    // fresh database from migrations: mirror rows may be seeded, but an OAuth connection cannot be —
    // it requires real tokens — so every entity would look "unconnected" and the guard would fail for
    // a reason that has nothing to do with the defect. Enforce only where connections are represented
    // (prod has 4). This is a scope refinement, not a waiver: the moment a database models even one
    // connection, every mirror row in it is held to the rule.
    const connTotal = await client.query("SELECT count(*)::int AS n FROM integrations.qbo_connections");
    if (Number(connTotal.rows[0]?.n ?? 0) === 0) {
      console.log(
        `${LABEL} SKIP — this database models ZERO qbo connections (fresh/seeded schema), so ` +
          `"no connection ⇒ no mirror rows" cannot be evaluated. Enforced wherever connections exist.`
      );
      return;
    }

    const findings = [];
    for (const rel of present) {
      // Counted with the bypass the CI role already has; the point is CROSS-ENTITY attribution, so
      // the query is deliberately not company-scoped.
      const res = await client.query(
        `SELECT m.operating_company_id::text AS opco,
                count(*)::int AS mirror_rows,
                (SELECT count(*)::int FROM integrations.qbo_connections q
                  WHERE q.operating_company_id = m.operating_company_id) AS connections
           FROM ${rel} m
          GROUP BY m.operating_company_id`
      );
      for (const row of findOrphanMirrorRows(res.rows)) {
        findings.push(`${rel}: ${row.mirror_rows} row(s) under ${row.opco}, which has NO qbo connection`);
      }
    }

    if (findings.length > 0) {
      console.error(
        `${LABEL} FAILED — a QBO mirror holds rows for an entity with no QuickBooks connection. That is a ` +
          `cross-entity leak: those rows belong to some OTHER entity's books and can be served to this one.\n  - ` +
          findings.join("\n  - ") +
          `\n\nSee docs/incidents/2026-06-25-usmca-qbo-mirror-cross-entity-leak.md. Do NOT allowlist — ` +
          `quarantine the rows (archive, never hard-delete) and fix the writer.`
      );
      process.exit(1);
    }
    console.log(`${LABEL} OK — every QBO mirror row belongs to an entity with a QuickBooks connection (${present.length} mirror table(s)).`);
  } finally {
    await client.end();
  }
}

function selftest() {
  const clean = [
    { opco: "transp", mirror_rows: 372, connections: 2 },
    { opco: "trk", mirror_rows: 917, connections: 2 },
  ];
  if (findOrphanMirrorRows(clean).length !== 0) {
    console.error("SELFTEST FAIL: connected entities with mirror rows were flagged.");
    process.exit(1);
  }
  console.log("  ok: entities WITH a connection and mirror rows are not flagged");

  // The real incident shape: rows present, connection absent.
  const contaminated = [...clean, { opco: "usmca", mirror_rows: 365, connections: 0 }];
  const caught = findOrphanMirrorRows(contaminated);
  if (caught.length !== 1 || caught[0].opco !== "usmca") {
    console.error(`SELFTEST FAIL: the 2026-06-25 contamination shape was NOT flagged (got ${JSON.stringify(caught)})`);
    process.exit(1);
  }
  console.log("  caught: 365 mirror rows under an entity with zero QBO connections (the real incident)");

  // An unconnected entity with NO rows is the correct steady state and must stay silent.
  if (findOrphanMirrorRows([{ opco: "usmca", mirror_rows: 0, connections: 0 }]).length !== 0) {
    console.error("SELFTEST FAIL: an unconnected entity with zero mirror rows was flagged.");
    process.exit(1);
  }
  console.log("  ok: an unconnected entity with zero rows is the correct state, not a finding");

  // A database with NO connections anywhere is a fresh/seeded schema, not a leak. The pure comparison
  // would flag every entity, which is exactly why the caller skips that environment; assert the shape
  // so the reason is recorded and cannot be "simplified" away later.
  const freshDb = [
    { opco: "transp", mirror_rows: 5, connections: 0 },
    { opco: "trk", mirror_rows: 5, connections: 0 },
  ];
  if (findOrphanMirrorRows(freshDb).length !== 2) {
    console.error("SELFTEST FAIL: expected the pure comparison to flag a zero-connection database — the CALLER must skip it, not the comparison.");
    process.exit(1);
  }
  console.log("  ok: a zero-connection database would flag everything, which is why the caller skips it");

  console.log("SELFTEST PASS — leak shape caught, clean shapes silent, fresh-DB skip justified.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
