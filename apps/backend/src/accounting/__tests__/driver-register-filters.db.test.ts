import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { DRIVER_BILL_REGISTER_SQL } from "../bills.routes.js";

// A disposable, empty loopback PG16 database only. No application/prod credentials.
const url = process.env.DRIVER_REGISTER_TEST_DATABASE_URL;
describe.skipIf(!url)("driver register filters on PostgreSQL16", () => {
  let client: pg.Client;
  const company = "10000000-0000-4000-8000-000000000001";
  const other = "10000000-0000-4000-8000-000000000002";
  const driver = "20000000-0000-4000-8000-000000000001";
  const driver2 = "20000000-0000-4000-8000-000000000002";
  const vendor = "30000000-0000-4000-8000-000000000001";
  const load = "40000000-0000-4000-8000-000000000001";
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || !target.pathname.startsWith("/codex443238_register")) throw Error("isolated test database required");
    client = new pg.Client({ connectionString: url });
    await client.connect();
    const identity = (await client.query("SELECT current_database() db, current_setting('server_version_num')::int version, host(inet_server_addr()) address")).rows[0];
    if (!identity.db.startsWith("codex443238_register") || identity.version < 160000 || identity.version >= 170000 || !["127.0.0.1", "::1"].includes(identity.address)) throw Error("PG16 loopback identity required");
    if ((await client.query("SELECT 1 FROM pg_namespace WHERE nspname IN ('mdata','driver_finance')")).rowCount) throw Error("database must be empty");
    await client.query("BEGIN");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query(`CREATE SCHEMA mdata; CREATE SCHEMA driver_finance;
      CREATE TABLE mdata.drivers (id uuid, operating_company_id uuid, first_name text, last_name text, is_sample_data boolean);
      CREATE TABLE mdata.vendors (id uuid, operating_company_id uuid, driver_id uuid, qbo_vendor_id text, is_sample_data boolean);
      CREATE TABLE driver_finance.driver_bills (id uuid, operating_company_id uuid, bill_number text, driver_id uuid,
        load_id uuid, load_number text, miles_basis numeric, rate_per_mile_cents int, miles_deadhead numeric,
        rate_empty_per_mile_cents int, gross_amount_cents int, status text, settled_in_settlement_id uuid,
        voided_at timestamptz, created_at timestamptz, is_sample_data boolean);
      CREATE TABLE driver_finance.driver_settlements (id uuid, operating_company_id uuid, source_document_ref text, status text, voided_at timestamptz, reversed_at timestamptz);
      CREATE TABLE driver_finance.settlement_lines (source_driver_bill_id uuid, settlement_id uuid, operating_company_id uuid, is_active boolean, voided_at timestamptz);`);
    await client.query("INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,is_sample_data) VALUES ($1,$2,'TEST','ONE',true),($3,$2,'TEST','TWO',true)", [driver, company, driver2]);
    await client.query("INSERT INTO mdata.vendors (id,operating_company_id,driver_id,qbo_vendor_id,is_sample_data) VALUES ($1,$2,$3,'legacy-1',true),($1,$4,$5,'legacy-1',true)", [vendor, company, driver, other, driver2]);
    await client.query(`INSERT INTO driver_finance.driver_bills (id,operating_company_id,bill_number,driver_id,load_id,load_number,status,created_at,is_sample_data)
      VALUES ('50000000-0000-4000-8000-000000000001',$1,'TEST-BILL-1',$2,$4,'TEST-LOAD','approved','2026-10-22T01:30:00Z',true),
             ('50000000-0000-4000-8000-000000000002',$1,'TEST-BILL-2',$3,$4,'TEST-LOAD','approved','2026-10-22T01:30:00Z',true)`, [company, driver, driver2, load]);
  });
  afterAll(async () => { if (client) { await client.query("ROLLBACK"); await client.end(); } });
  const read = (overrides: Record<number, unknown> = {}) => {
    const binds: unknown[] = [company, false, 100, 0, ["approved"], null, null, null, null, null, null];
    for (const [i,v] of Object.entries(overrides)) binds[Number(i)-1] = v;
    const parameterCount = Math.max(...[...DRIVER_BILL_REGISTER_SQL.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
    return client.query(DRIVER_BILL_REGISTER_SQL, binds.slice(0, parameterCount));
  };
  it("filters native and legacy vendor identity without accepting another company's driver link", async () => {
    for (const id of [vendor, "legacy-1"]) expect((await read({11:id})).rows.map(r=>r.bill_number)).toEqual(["TEST-BILL-1"]);
    expect((await read({11:"unknown"})).rowCount).toBe(0);
    expect((await read()).rowCount).toBe(2);
  });
  it("uses the Central creation day for both inclusive date boundaries", async () => {
    expect((await read({8:"2026-10-21",9:"2026-10-21"})).rowCount).toBe(2);
    expect((await read({8:"2026-10-22",9:"2026-10-22"})).rowCount).toBe(0);
  });
  it("preserves driver, load, status and search filters together", async () => {
    expect((await read({6:driver,7:load,10:"BILL-1",11:vendor})).rowCount).toBe(1);
    expect((await read({5:["paid"]})).rowCount).toBe(0);
    expect((await read({6:driver2,11:vendor})).rowCount).toBe(0);
  });
});
