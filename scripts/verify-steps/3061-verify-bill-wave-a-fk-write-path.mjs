#!/usr/bin/env node
/**
 * P38 (38 OF 50) — Wave-A linkage ratchet for accounting bills.
 *
 * THE COLUMN: a bill must be able to say which UNIT it is for, which VENDOR it is owed to, and which
 * LOAD it belongs to. Without those FKs a bill is a floating number: no unit cost, no load
 * profitability, no vendor spend — the CLS-LINKAGE-ONEWAY class.
 *
 * ★ WHAT THIS DOES **NOT** ASSERT, AND WHY. It does NOT require every bill to carry all three FKs.
 * A legal-fee bill has no unit and no load; a monthly bank fee has neither. Demanding NOT NULL on
 * every row would fail CI on correct data — the state in which a guard gets weakened or deleted
 * (exactly how ACCT-F333's coverage hole was born). What must never regress is the CAPABILITY.
 *
 * SO IT RATCHETS TWO THINGS:
 *   A. STATIC — the canonical create path still BINDS the FK columns. If someone drops unit_id from
 *      the bills INSERT or load_id from the bill_lines INSERT, the product silently stops linking and
 *      every future bill floats. A static read catches that in CI with no database.
 *   B. LIVE — at least one USMCA bill actually carries unit_id + mdata_vendor_id with a line carrying
 *      load_id. Proof the path RAN, not merely that it compiles. Column-binding can be present while
 *      the value is dropped upstream; only a real row proves the whole chain.
 *
 * Invariant A runs everywhere (static). Invariant B needs a DB and SKIPs without one, so CI's
 * static-context run still enforces the half that does not need Postgres.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LABEL = "3061-verify-bill-wave-a-fk-write-path";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

// ── INVARIANT A — the write path still binds the FK columns ──────────────────────────────────────
const SERVICE = path.join("apps", "backend", "src", "accounting", "bills.service.ts");
if (!fs.existsSync(SERVICE)) fail(`${SERVICE} not found — the bill write path moved; re-point this guard rather than deleting it`);
const src = fs.readFileSync(SERVICE, "utf8");

const billsInserts = src.match(/INSERT INTO accounting\.bills\s*\(([\s\S]*?)\)/g) ?? [];
if (billsInserts.length === 0) fail("no INSERT INTO accounting.bills found in bills.service.ts — the create path moved or was removed");
// EVERY bills INSERT variant must bind the FKs. The service branches on which optional columns exist
// on the connected DB, so checking only the first variant would let a branch quietly drop them.
const missingHeader = [];
billsInserts.forEach((stmt, i) => {
  if (!/\bunit_id\b/.test(stmt)) missingHeader.push(`variant ${i + 1}: unit_id`);
  if (!/\bmdata_vendor_id\b/.test(stmt)) missingHeader.push(`variant ${i + 1}: mdata_vendor_id`);
});

const lineInserts = src.match(/INSERT INTO accounting\.bill_lines\s*\(([\s\S]*?)\)/g) ?? [];
if (lineInserts.length === 0) fail("no INSERT INTO accounting.bill_lines found — the line write path moved or was removed");
const missingLine = lineInserts.flatMap((stmt, i) => (/\bload_id\b/.test(stmt) ? [] : [`variant ${i + 1}: load_id`]));

if (missingHeader.length || missingLine.length) {
  for (const m of [...missingHeader, ...missingLine]) console.error(` - bills.service.ts ${m} is no longer bound in the INSERT`);
  fail(
    `${missingHeader.length + missingLine.length} Wave-A FK column(s) dropped from the bill write path — a bill that cannot record its unit, vendor or load is a floating number (P38)`
  );
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] PASS (static half) — write path binds unit_id + mdata_vendor_id (${billsInserts.length} INSERT variant(s)) and load_id (${lineInserts.length} line variant(s)); no DATABASE_URL for the live half`);
  process.exit(0);
}

// ── INVARIANT B — a real row proves the path RAN ─────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] PASS (static half) — database unreachable; static invariant held`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const present = await client.query(`SELECT to_regclass('accounting.bills') IS NOT NULL AS present`);
  if (!present.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] PASS (static half) — accounting schema not present (fresh/unmigrated DB); static invariant held`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  const { rows } = await client.query(
    `
      SELECT count(*)::int AS live_bills,
             count(*) FILTER (
               WHERE b.unit_id IS NOT NULL
                 AND b.mdata_vendor_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM accounting.bill_lines bl WHERE bl.bill_id = b.id AND bl.load_id IS NOT NULL)
             )::int AS fully_linked
        FROM accounting.bills b
       WHERE b.operating_company_id = $1::uuid
         AND b.voided_at IS NULL
         AND b.revoked_at IS NULL
    `,
    [USMCA]
  );
  await client.query("COMMIT");

  const live = rows[0]?.live_bills ?? 0;
  const linked = rows[0]?.fully_linked ?? 0;

  if (linked === 0) {
    fail(
      live === 0
        ? "USMCA has NO live bills at all, so the Wave-A link cannot be demonstrated — Built requires one real row with unit_id + vendor + line load_id NOT NULL (P38)"
        : `USMCA has ${live} live bill(s) and NOT ONE carries unit_id + mdata_vendor_id + a line load_id — the write path binds the columns but nothing has exercised it end to end (P38)`
    );
  }

  console.log(`[${LABEL}] PASS — write path binds the FK columns AND ${linked} of ${live} live USMCA bill(s) carry unit + vendor + load FKs`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
