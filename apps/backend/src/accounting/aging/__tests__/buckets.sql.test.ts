import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  AGING_BUCKETS,
  agingBucketWindow,
  agingWindowPredicate,
  assignAgingBucket,
  bucketLadderIsTotal,
  daysOverdue,
  agingWindowFromBucket,
  type AgingBucketId,
} from "../buckets";

/**
 * ACCT-F411 — the SQL and the JS must give the SAME answer, and this proves it against a REAL
 * Postgres rather than asserting it in prose. A bucket on a report is computed in JS
 * (assignAgingBucket); the drilled list is filtered in SQL (agingWindowPredicate). If those two
 * disagree by a single day at a boundary, the owner clicks a figure and gets a list that adds to
 * something else. That is the exact defect this block removes, so it gets a live proof, not a
 * code comment.
 *
 * The matrix sits ON the boundaries (0/1, 30/31, 60/61, 90/91) and on the awkward cases: no due
 * date, a due date in the future, a leap day, and dates either side of a DST change in the
 * company's zone — dates are compared as dates, so DST must not shift the count.
 *
 * Fails loudly, never silently, when no Postgres is reachable.
 */

const PG_URL = process.env.AGING_TEST_PG_URL ?? "postgresql://postgres@/postgres?host=/var/tmp&port=54329";

let client: Client | null = null;
let pgReason = "";

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
await (async () => {
  try {
    const c = new Client({ connectionString: PG_URL });
    await c.connect();
    // SAFETY, same rule as list-window.sql.test.ts. This file only ever makes a TEMP table, which
    // is session-local and vanishes on disconnect — but the rule is "never write to a database that
    // holds the company's books", not "write only harmless things to it". One rule, no judgement
    // call per test. accounting.journal_entry_postings is the real system's fingerprint.
    const fingerprint = await c.query<{ real: boolean }>(
      "select to_regclass('accounting.journal_entry_postings') is not null as real"
    );
    if (fingerprint.rows[0]?.real) {
      await c.end().catch(() => undefined);
      throw new Error(
        "REFUSING TO RUN: this connection is a real IH35 database (accounting.journal_entry_postings " +
          "exists). Point AGING_TEST_PG_URL at an empty throwaway Postgres instead."
      );
    }
    await c.query("create temp table aging_probe (id int primary key, due_date date)");
    client = c;
  } catch (error) {
    pgReason = String((error as Error)?.message ?? error);
    client = null;
    // Loud, so a skipped SQL proof is never mistaken for a passed one.
    console.warn(
      `[ACCT-F411] SKIPPING the live-Postgres half of this proof: ${pgReason}\n` +
        `            The JS half still ran. Set AGING_TEST_PG_URL and re-run in the gate.`
    );
  }
})();

afterAll(async () => {
  await client?.end().catch(() => undefined);
});

const AS_OF = "2026-10-05";

/** [dueDate, expected days overdue] — the boundaries and the awkward cases. */
const MATRIX: Array<[string | null, number]> = [
  [null, 0],
  ["2026-12-31", -87],
  ["2026-10-06", -1],
  ["2026-10-05", 0],
  ["2026-10-04", 1],
  ["2026-09-05", 30],
  ["2026-09-04", 31],
  ["2026-08-06", 60],
  ["2026-08-05", 61],
  ["2026-07-07", 90],
  ["2026-07-06", 91],
  ["2024-02-29", 949],
  ["2026-03-07", 212],
  ["2026-03-09", 210],
];

function bind(values: unknown[]) {
  return (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
}

function requireClient(): Client {
  if (!client) throw new Error(`ACCT-F411 proof needs Postgres and could not reach one: ${pgReason}`);
  return client;
}

describe("ACCT-F411 aging ladder — one definition", () => {
  it("covers the number line with no gap and no overlap", () => {
    expect(bucketLadderIsTotal()).toEqual({ ok: true });
  });

  it("classifies every boundary the way the reports already did", () => {
    const expected: Array<[number, AgingBucketId]> = [
      [-87, "current"], [-1, "current"], [0, "current"],
      [1, "d1_30"], [30, "d1_30"],
      [31, "d31_60"], [60, "d31_60"],
      [61, "d61_90"], [90, "d61_90"],
      [91, "d90_plus"], [949, "d90_plus"],
    ];
    for (const [days, bucket] of expected) {
      const due = new Date(Date.parse(`${AS_OF}T00:00:00.000Z`) - days * 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect(assignAgingBucket(AS_OF, due), `${days}d must be ${bucket}`).toBe(bucket);
    }
    expect(assignAgingBucket(AS_OF, null)).toBe("current");
  });

  it("resolves a bucket NAME to its window, and refuses a name it does not know", () => {
    // The wire carries the bucket id, never two day numbers, so the caller cannot send a window
    // whose max is below its min — that error class does not exist by construction.
    expect(agingWindowFromBucket(null)).toBeNull();
    expect(agingWindowFromBucket(undefined)).toBeNull();
    expect(agingWindowFromBucket("d31_60")).toEqual({ minDaysOverdue: 31, maxDaysOverdue: 60 });
    expect(agingWindowFromBucket("current")).toEqual({ minDaysOverdue: null, maxDaysOverdue: 0 });
    expect(agingWindowFromBucket("d90_plus")).toEqual({ minDaysOverdue: 91, maxDaysOverdue: null });
    expect(() => agingWindowFromBucket("d31_90")).toThrow("unknown_aging_bucket:d31_90");
  });

  it("spans SEVERAL contiguous buckets, because a report column is not always one bucket", () => {
    // MEASURED: the A/P aging table's "0–30" column is `current + b1_30`
    // (reports/ap-aging.routes.ts: `bucket_0_30_cents: current + b1_30`). Drilling it to a single
    // bucket would have reached HALF the money the cell displays.
    expect(agingWindowFromBucket(["current", "d1_30"])).toEqual({
      minDaysOverdue: null,
      maxDaysOverdue: 30,
    });
    expect(agingWindowFromBucket(["d31_60", "d61_90"])).toEqual({
      minDaysOverdue: 31,
      maxDaysOverdue: 90,
    });
    // Order and duplicates must not matter.
    expect(agingWindowFromBucket(["d1_30", "current", "d1_30"])).toEqual({
      minDaysOverdue: null,
      maxDaysOverdue: 30,
    });
    expect(agingWindowFromBucket(["d61_90", "d90_plus"])).toEqual({
      minDaysOverdue: 61,
      maxDaysOverdue: null,
    });
  });

  it("refuses a NON-contiguous selection instead of spanning the gap and overstating the list", () => {
    expect(() => agingWindowFromBucket(["current", "d61_90"])).toThrow(
      "non_contiguous_aging_buckets:current,d61_90"
    );
    expect(() => agingWindowFromBucket(["d1_30", "d90_plus"])).toThrow("non_contiguous_aging_buckets");
  });

  it("adds no SQL when no window was asked for, so existing callers are untouched", () => {
    const values: unknown[] = [];
    expect(
      agingWindowPredicate("p.due_date", AS_OF, { minDaysOverdue: null, maxDaysOverdue: null }, bind(values))
    ).toBeNull();
    expect(values).toHaveLength(0);
  });
});

describe.skipIf(pgUnavailable())("ACCT-F411 aging ladder — SQL agrees with JS (live Postgres)", () => {
  it("a span's SQL selects exactly the union of its buckets' rows, live", async () => {
    const c = requireClient();
    await c.query("truncate aging_probe");
    for (const [index, [due]] of MATRIX.entries()) {
      await c.query("insert into aging_probe (id, due_date) values ($1, $2::date)", [index, due]);
    }
    const spans: Array<readonly AgingBucketId[]> = [
      ["current", "d1_30"],
      ["d31_60", "d61_90"],
      ["d61_90", "d90_plus"],
      ["current", "d1_30", "d31_60", "d61_90", "d90_plus"],
    ];
    for (const span of spans) {
      const values: unknown[] = [];
      const window = agingWindowFromBucket(span as unknown as string[]);
      const predicate = agingWindowPredicate("p.due_date", AS_OF, window!, bind(values));
      const rows = predicate
        ? (await c.query<{ id: number }>(`select p.id from aging_probe p where ${predicate} order by p.id`, values)).rows.map((r) => r.id)
        : MATRIX.map((_, i) => i);
      const fromJs = MATRIX.map(([due], i) => [assignAgingBucket(AS_OF, due), i] as const)
        .filter(([id]) => span.includes(id))
        .map(([, i]) => i);
      expect(rows, `span ${span.join("+")}: SQL must equal the union of the buckets`).toEqual(fromJs);
    }
  });

  it("computes the same day count as daysOverdue(), on every boundary", async () => {
    const c = requireClient();
    for (const [due, expectedDays] of MATRIX) {
      const res = await c.query<{ days: number }>(
        "select COALESCE($1::date - $2::date, 0)::int as days",
        [AS_OF, due]
      );
      expect(res.rows[0].days, `sql days for due=${due}`).toBe(expectedDays);
      expect(daysOverdue(AS_OF, due), `js days for due=${due}`).toBe(expectedDays);
    }
  });

  it("puts every row in the same bucket the JS classifier chose, for all five buckets", async () => {
    const c = requireClient();
    await c.query("truncate aging_probe");
    for (const [index, [due]] of MATRIX.entries()) {
      await c.query("insert into aging_probe (id, due_date) values ($1, $2::date)", [index, due]);
    }
    for (const bucket of AGING_BUCKETS) {
      const values: unknown[] = [];
      const predicate = agingWindowPredicate("p.due_date", AS_OF, agingBucketWindow(bucket.id), bind(values));
      expect(predicate, `${bucket.id} must produce SQL`).not.toBeNull();
      const res = await c.query<{ id: number }>(
        `select p.id from aging_probe p where ${predicate} order by p.id`,
        values
      );
      const fromSql = res.rows.map((r) => r.id);
      const fromJs = MATRIX.map(([due], i) => [assignAgingBucket(AS_OF, due), i] as const)
        .filter(([id]) => id === bucket.id)
        .map(([, i]) => i);
      expect(fromSql, `${bucket.id}: SQL rows must equal JS rows`).toEqual(fromJs);
    }
  });

  it("partitions the rows — every row in exactly one bucket, SQL side", async () => {
    const c = requireClient();
    const counts = new Map<number, number>();
    for (const bucket of AGING_BUCKETS) {
      const values: unknown[] = [];
      const predicate = agingWindowPredicate("p.due_date", AS_OF, agingBucketWindow(bucket.id), bind(values));
      const res = await c.query<{ id: number }>(`select p.id from aging_probe p where ${predicate}`, values);
      for (const row of res.rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
    }
    expect(counts.size, "every probe row must land somewhere").toBe(MATRIX.length);
    for (const [id, n] of counts) expect(n, `row ${id} landed in ${n} buckets`).toBe(1);
  });
});
