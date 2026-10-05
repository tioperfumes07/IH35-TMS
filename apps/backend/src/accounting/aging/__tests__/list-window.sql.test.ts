import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { AGING_BUCKETS, agingBucketWindow, agingWindowPredicate, assignAgingBucket } from "../buckets";
import { BILL_AGING_DUE_DATE_SQL } from "../../bills.service";

/**
 * ACCT-F411 — the LIST filter must select exactly the rows its BUCKET counted, on real tables with
 * real NULLs. The previous test proved the ladder's two renderings agree on a bare date column;
 * this one proves the two expressions the live queries actually use:
 *
 *   A/P  COALESCE(b.due_date, b.bill_date)   (BILL_AGING_DUE_DATE_SQL, imported — not retyped, so
 *                                             the test cannot pass against a stale copy)
 *   A/R  i.due_date
 *
 * The A/P case is the one worth a live table: a bill with due_date NULL must age off its BILL date,
 * not fall to "current" — the report does that with its own COALESCE, so the list has to as well.
 * A bill with BOTH dates NULL is "current" in both. Those three shapes are what a bare-column test
 * cannot show.
 */

const PG_URL = process.env.AGING_TEST_PG_URL ?? "postgresql://postgres@/postgres?host=/var/tmp&port=54329";
const AS_OF = "2026-10-05";

let client: Client | null = null;
let pgReason = "";
/** The throwaway schema this test creates and drops. Never a real schema name. */
let SCHEMA = "";

/**
 * The SQL half of this proof needs a Postgres. The JS half does not, and it is the half that pins
 * the ladder's boundaries, so it ALWAYS runs. When no Postgres is reachable the SQL half SKIPS and
 * says loudly why, rather than failing on infrastructure that is not the thing under test — a
 * check that cries wolf gets ignored, and an ignored check is worse than no check. It also never
 * passes blind: a skip is a visible skip with a printed reason, and the gate (which has a database)
 * is where this must actually run. Point it at one with AGING_TEST_PG_URL.
 */
// NOTE the call parentheses at every use site. describe.skipIf takes a BOOLEAN, and a function
// REFERENCE is always truthy — passing `pgUnavailable` instead of `pgUnavailable()` skipped the
// whole SQL half against a live server while reporting a clean "7 passed | 7 skipped". Measured and
// fixed here; it is the same defect class this file exists to catch, one level up.
function pgUnavailable(): boolean {
  return client === null;
}

// Probed at MODULE LOAD, not in beforeAll: describe.skipIf is evaluated at COLLECTION time, so a
// hook sets `client` too late and the SQL half skips even when Postgres is up (measured: "7 passed
// | 7 skipped" with a live server). Top-level await is what makes the predicate truthful.
/**
 * SAFETY — read this before changing anything below.
 *
 * CC-2 CAUGHT A DEFECT I SHIPPED IN THIS FILE. It used to run
 *     drop table if exists accounting.bills
 *     drop table if exists accounting.invoices
 * and then create its own fakes under those names. Pointed at the GATE credential — which is
 * PRODUCTION with a role that can write — that would have DESTROYED the two most important tables
 * in the system. Worse, my own bus order told CC-2 to set AGING_TEST_PG_URL to the gate database.
 * CC-2 refused to run it and said so. That refusal was correct and it prevented real damage.
 *
 * The fix is not "be careful with the URL". It is that this test CANNOT destroy anything, by
 * construction, and cannot even run against a real database:
 *   1. It never names accounting.bills or accounting.invoices. It creates its OWN schema with a
 *      random name and puts `bills` and `invoices` inside it. The SQL under test addresses columns
 *      through an alias (b.due_date, i.due_date), so the schema name is irrelevant to the proof.
 *   2. It DROPs only the schema it created, and only at the end.
 *   3. Before any DDL it fingerprints the database for the real system and ABORTS if it finds it.
 *      accounting.journal_entry_postings existing means this is an IH35 database, throwaway or
 *      production, and either way this test does not create schemas in it.
 * A test that can delete the company's books is not a test. It is a loaded gun in the gate.
 */
await (async () => {
  try {
    const c = new Client({ connectionString: PG_URL });
    await c.connect();

    // FINGERPRINT FIRST, DDL SECOND. accounting.journal_entry_postings is the real system's
    // signature; if it is here, this connection is an IH35 database and we create nothing.
    const fingerprint = await c.query<{ real: boolean }>(
      "select to_regclass('accounting.journal_entry_postings') is not null as real"
    );
    if (fingerprint.rows[0]?.real) {
      await c.end().catch(() => undefined);
      throw new Error(
        "REFUSING TO RUN: this connection is a real IH35 database (accounting.journal_entry_postings " +
          "exists). This test creates and drops a throwaway schema and must never be pointed at a " +
          "database that holds the company's books. Point AGING_TEST_PG_URL at an empty throwaway " +
          "Postgres instead."
      );
    }

    // Our own schema, random name, so two concurrent runs cannot collide and nothing pre-existing
    // is ever touched.
    SCHEMA = `aging_probe_${Math.random().toString(36).slice(2, 10)}`;
    await c.query(`create schema ${SCHEMA}`);
    await c.query(`create table ${SCHEMA}.bills (id int primary key, due_date date, bill_date date, note text)`);
    await c.query(`create table ${SCHEMA}.invoices (id int primary key, due_date date, note text)`);
    client = c;
  } catch (error) {
    pgReason = String((error as Error)?.message ?? error);
    client = null;
    console.warn(
      `[ACCT-F411] SKIPPING the live-Postgres half of this proof: ${pgReason}\n` +
        `            The JS half still ran. Point AGING_TEST_PG_URL at an EMPTY THROWAWAY Postgres ` +
        `(never the gate or production credential) and re-run.`
    );
  }
})();

afterAll(async () => {
  // Drop ONLY the schema this test created, and only if it created one.
  if (client && SCHEMA) {
    await client.query(`drop schema if exists ${SCHEMA} cascade`).catch(() => undefined);
  }
  await client?.end().catch(() => undefined);
});

function requireClient(): Client {
  if (!client) throw new Error(`ACCT-F411 list proof needs Postgres and could not reach one: ${pgReason}`);
  return client;
}

function bind(values: unknown[]) {
  return (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
}

/** [id, due_date, bill_date, the date the A/P report would age off] */
const BILLS: Array<[number, string | null, string | null, string | null]> = [
  [1, "2026-10-05", "2026-01-01", "2026-10-05"], // due today -> current
  [2, "2026-10-04", "2026-01-01", "2026-10-04"], // 1 day -> d1_30
  [3, "2026-09-04", "2026-01-01", "2026-09-04"], // 31 -> d31_60
  [4, "2026-08-05", "2026-01-01", "2026-08-05"], // 61 -> d61_90
  [5, "2026-07-06", "2026-01-01", "2026-07-06"], // 91 -> d90_plus
  [6, null, "2026-08-05", "2026-08-05"],          // NO due date: ages off the BILL date (61)
  [7, null, "2026-10-05", "2026-10-05"],          // NO due date, billed today -> current
  [8, null, null, null],                          // neither -> current
  [9, "2026-12-31", "2026-01-01", "2026-12-31"],  // not yet due -> current
];

const INVOICES: Array<[number, string | null]> = [
  [1, "2026-10-05"], [2, "2026-10-04"], [3, "2026-09-05"], [4, "2026-09-04"],
  [5, "2026-08-06"], [6, "2026-08-05"], [7, "2026-07-07"], [8, "2026-07-06"],
  [9, "2027-01-01"],
];

describe.skipIf(pgUnavailable())("ACCT-F411 — the A/P list window selects exactly the bucket's rows", () => {
  it("uses the report's own COALESCE, so a bill with no due date ages off its bill date", async () => {
    const c = requireClient();
    await c.query(`truncate ${SCHEMA}.bills`);
    for (const [id, due, billDate] of BILLS) {
      await c.query(
        `insert into ${SCHEMA}.bills (id, due_date, bill_date) values ($1, $2::date, $3::date)`,
        [id, due, billDate]
      );
    }
    // Sanity: the expression under test is the one the service exports, not a retyped copy.
    expect(BILL_AGING_DUE_DATE_SQL).toBe("COALESCE(b.due_date, b.bill_date)");

    const seen = new Map<number, number>();
    for (const bucket of AGING_BUCKETS) {
      const values: unknown[] = [];
      const predicate = agingWindowPredicate(
        BILL_AGING_DUE_DATE_SQL,
        AS_OF,
        agingBucketWindow(bucket.id),
        bind(values)
      );
      const res = await c.query<{ id: number }>(
        `select b.id from ${SCHEMA}.bills b where ${predicate} order by b.id`,
        values
      );
      const fromSql = res.rows.map((r) => r.id);
      // What the REPORT would have counted, from the same rows, through the same classifier.
      const fromReport = BILLS.filter(([, , , aged]) => assignAgingBucket(AS_OF, aged) === bucket.id).map(
        ([id]) => id
      );
      expect(fromSql, `A/P ${bucket.id}: list rows must equal report rows`).toEqual(fromReport);
      for (const id of fromSql) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    expect(seen.size, "every bill must land in a bucket").toBe(BILLS.length);
    for (const [id, n] of seen) expect(n, `bill ${id} landed in ${n} buckets`).toBe(1);
  });

  it("puts bill 6 (no due date, billed 61 days ago) in 61-90 and NOT in current", async () => {
    const c = requireClient();
    const values: unknown[] = [];
    const predicate = agingWindowPredicate(
      BILL_AGING_DUE_DATE_SQL,
      AS_OF,
      agingBucketWindow("d61_90"),
      bind(values)
    );
    const res = await c.query<{ id: number }>(
      `select b.id from ${SCHEMA}.bills b where ${predicate} order by b.id`,
      values
    );
    expect(res.rows.map((r) => r.id)).toContain(6);

    const cv: unknown[] = [];
    const currentPredicate = agingWindowPredicate(
      BILL_AGING_DUE_DATE_SQL,
      AS_OF,
      agingBucketWindow("current"),
      bind(cv)
    );
    const currentRes = await c.query<{ id: number }>(
      `select b.id from ${SCHEMA}.bills b where ${currentPredicate} order by b.id`,
      cv
    );
    expect(currentRes.rows.map((r) => r.id)).not.toContain(6);
    // bills 7, 8 and 9 ARE current: billed today, no dates at all, and not yet due.
    expect(currentRes.rows.map((r) => r.id)).toEqual([1, 7, 8, 9]);
  });
});

describe.skipIf(pgUnavailable())("ACCT-F411 — the A/R list window selects exactly the bucket's rows", () => {
  it("ages off i.due_date, the same column ar-aging.service.ts buckets on", async () => {
    const c = requireClient();
    await c.query(`truncate ${SCHEMA}.invoices`);
    for (const [id, due] of INVOICES) {
      await c.query(`insert into ${SCHEMA}.invoices (id, due_date) values ($1, $2::date)`, [id, due]);
    }
    const seen = new Map<number, number>();
    for (const bucket of AGING_BUCKETS) {
      const values: unknown[] = [];
      const predicate = agingWindowPredicate("i.due_date", AS_OF, agingBucketWindow(bucket.id), bind(values));
      const res = await c.query<{ id: number }>(
        `select i.id from ${SCHEMA}.invoices i where ${predicate} order by i.id`,
        values
      );
      const fromSql = res.rows.map((r) => r.id);
      const fromReport = INVOICES.filter(([, due]) => assignAgingBucket(AS_OF, due) === bucket.id).map(
        ([id]) => id
      );
      expect(fromSql, `A/R ${bucket.id}: list rows must equal report rows`).toEqual(fromReport);
      for (const id of fromSql) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    expect(seen.size).toBe(INVOICES.length);
    for (const [id, n] of seen) expect(n, `invoice ${id} landed in ${n} buckets`).toBe(1);
  });

  it("the five buckets together are the whole open set — no row is lost between them", async () => {
    const c = requireClient();
    const all = await c.query<{ n: number }>(`select count(*)::int as n from ${SCHEMA}.invoices`);
    let union = 0;
    for (const bucket of AGING_BUCKETS) {
      const values: unknown[] = [];
      const predicate = agingWindowPredicate("i.due_date", AS_OF, agingBucketWindow(bucket.id), bind(values));
      const res = await c.query<{ n: number }>(
        `select count(*)::int as n from ${SCHEMA}.invoices i where ${predicate}`,
        values
      );
      union += res.rows[0].n;
    }
    expect(union, "sum of the buckets must equal the whole set").toBe(all.rows[0].n);
  });
});
