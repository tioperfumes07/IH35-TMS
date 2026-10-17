import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { canonicalCustomerKey, lockAndFindCanonicalCustomer } from "../customer-create-dedup.js";

// LEAD 443.194 — two creates of one customer submitted together both passed the out-of-transaction name check and
// both inserted (USMCA, 2026-10-16: two "Tropic Brokers Inc", two "STEPBYSTEPLOGISTICSLLC"). The create transaction
// must take a (company, canonical key) lock and re-check on the canonical key BEFORE its INSERT.
const here = path.dirname(fileURLToPath(import.meta.url));
const route = fs.readFileSync(path.join(here, "../customers.routes.ts"), "utf8");

type Call = { sql: string; values?: unknown[] };
const fakeClient = (existing: Record<string, unknown> | null) => {
  const calls: Call[] = [];
  return {
    calls,
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: /FROM mdata\.customers/.test(sql) && existing ? [existing] : [] } as never;
    },
  };
};

describe("customer create dedup — canonical key, under a lock, in the insert transaction (443.194)", () => {
  it("uses the canonical engine's key (punctuation/space/case-insensitive)", () => {
    expect(canonicalCustomerKey("Tropic Brokers, Inc.")).toBe("TROPICBROKERSINC");
    expect(canonicalCustomerKey("STEP BY STEP LOGISTICS LLC")).toBe(canonicalCustomerKey("STEPBYSTEPLOGISTICSLLC"));
  });

  it("takes the (company, key) advisory lock BEFORE looking the key up", async () => {
    const c = fakeClient(null);
    const r = await lockAndFindCanonicalCustomer(c, "5c854333-6ea5-4faa-af31-67cb272fef80", "Tropic Brokers Inc");
    expect(r).toBeNull();
    expect(c.calls[0]!.sql).toMatch(/pg_advisory_xact_lock/);
    expect(c.calls[0]!.values).toEqual(["mdata.customers.create:5c854333-6ea5-4faa-af31-67cb272fef80:TROPICBROKERSINC"]);
    expect(c.calls[1]!.sql).toMatch(/upper\(regexp_replace\(customer_name, '\[\^A-Za-z0-9\]', '', 'g'\)\) = \$2/);
    expect(c.calls[1]!.values).toEqual(["5c854333-6ea5-4faa-af31-67cb272fef80", "TROPICBROKERSINC"]);
  });

  it("returns the existing holder of the key", async () => {
    const c = fakeClient({ id: "x", customer_name: "Tropic Brokers Inc", deactivated_at: null });
    expect(await lockAndFindCanonicalCustomer(c, "oc", "TROPIC BROKERS, INC")).toMatchObject({ id: "x" });
  });

  it("the create route calls it inside the insert transaction, before the INSERT, and maps it to 409", () => {
    const lock = route.indexOf("await lockAndFindCanonicalCustomer(client, resolvedOperatingCompanyId, normalizedName)");
    const insert = route.indexOf("`INSERT INTO mdata.customers (${columns.join(\", \")})");
    const txnStart = route.lastIndexOf("const created = await withCurrentUser(authUser.uuid, async (client) => {", lock);
    expect(lock).toBeGreaterThan(0);
    expect(txnStart).toBeGreaterThan(0);
    expect(insert).toBeGreaterThan(lock);
    expect(route.slice(txnStart, insert)).toContain("throw new CustomerCanonicalNameConflict(existing)");
    expect(route).toMatch(/err instanceof CustomerCanonicalNameConflict\)[\s\S]{0,80}reply\.code\(409\)/);
  });
});

// Real-Postgres proof (local only): two concurrent creates of one name. Set LOCAL_PG_TEST_URL to a DISPOSABLE local db.
const LOCAL = process.env.LOCAL_PG_TEST_URL;
describe.skipIf(!LOCAL)("concurrent creates on real Postgres (LOCAL_PG_TEST_URL)", () => {
  const OC = "5c854333-6ea5-4faa-af31-67cb272fef80";
  const setup = async () => {
    const c = new pg.Client({ connectionString: LOCAL });
    await c.connect();
    await c.query(`CREATE SCHEMA IF NOT EXISTS mdata; DROP TABLE IF EXISTS mdata.customers;
      CREATE TABLE mdata.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operating_company_id uuid NOT NULL,
        customer_name text NOT NULL, deactivated_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
    await c.end();
  };
  const create = async (name: string, guarded: boolean) => {
    const c = new pg.Client({ connectionString: LOCAL });
    await c.connect();
    try {
      // the pre-existing unlocked check (its own statement), then the insert transaction
      const pre = await c.query(`SELECT 1 FROM mdata.customers WHERE lower(btrim(customer_name)) = lower(btrim($1)) AND operating_company_id = $2`, [name, OC]);
      if (pre.rows.length) return "conflict";
      await new Promise((r) => setTimeout(r, 50)); // both requests are past the pre-check
      await c.query("BEGIN");
      if (guarded && (await lockAndFindCanonicalCustomer(c, OC, name))) { await c.query("ROLLBACK"); return "conflict"; }
      await c.query(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2)`, [OC, name]);
      await new Promise((r) => setTimeout(r, 50)); // hold the transaction open (audit/outbox writes)
      await c.query("COMMIT");
      return "created";
    } finally {
      await c.end();
    }
  };
  const count = async () => {
    const c = new pg.Client({ connectionString: LOCAL });
    await c.connect();
    const n = (await c.query(`SELECT count(*)::int n FROM mdata.customers`)).rows[0].n as number;
    await c.end();
    return n;
  };

  it("WITHOUT the lock both concurrent creates insert (the 2026-10-16 defect)", async () => {
    await setup();
    await Promise.all([create("Tropic Brokers Inc", false), create("Tropic Brokers Inc", false)]);
    expect(await count()).toBe(2);
  });

  it("WITH the lock exactly one inserts and the other is refused", async () => {
    await setup();
    const out = await Promise.all([create("Tropic Brokers Inc", true), create("TROPIC BROKERS, INC.", true)]);
    expect(out.sort()).toEqual(["conflict", "created"]);
    expect(await count()).toBe(1);
  });
});
