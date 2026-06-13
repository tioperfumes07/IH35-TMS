#!/usr/bin/env node
/**
 * verify:m2-integrity-position-history
 *
 * CI guard for M2 block: Position History for Integrity/Positioned-Parts
 */

import pg from "pg";
import dotenv from "dotenv";
import { createRequire } from "node:module";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL or DATABASE_DIRECT_URL");
  process.exit(1);
}

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();

  // Set company context for RLS testing
  await client.query(`SET app.operating_company_id = '00000000-0000-0000-0000-000000000000'`);

  for (const t of tests) {
    try {
      await t.fn(client);
      console.log(`  [PASS] ${t.name}`);
      passed++;
    } catch (error) {
      console.log(`  [FAIL] ${t.name}: ${error.message}`);
      failed++;
    }
  }

  await client.end();
}

// Test: Table exists in maint schema
test("maint.position_history table exists", async (client) => {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'maint' AND table_name = 'position_history'
    )
  `);
  if (!result.rows[0].exists) {
    throw new Error("Table maint.position_history does not exist");
  }
});

// Test: RLS is enabled
test("RLS enabled on position_history", async (client) => {
  const result = await client.query(`
    SELECT relrowsecurity FROM pg_class 
    WHERE relnamespace = 'maint'::regnamespace AND relname = 'position_history'
  `);
  if (result.rows.length === 0 || !result.rows[0].relrowsecurity) {
    throw new Error("RLS not enabled on maint.position_history");
  }
});

// Test: RLS is forced
test("RLS FORCE enabled on position_history", async (client) => {
  const result = await client.query(`
    SELECT relforcerowsecurity FROM pg_class 
    WHERE relnamespace = 'maint'::regnamespace AND relname = 'position_history'
  `);
  if (result.rows.length === 0 || !result.rows[0].relforcerowsecurity) {
    throw new Error("RLS FORCE not enabled on maint.position_history");
  }
});

// Test: Tenant isolation policy exists
test("tenant_isolation policy exists", async (client) => {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'maint' AND tablename = 'position_history' AND policyname = 'tenant_isolation'
    )
  `);
  if (!result.rows[0].exists) {
    throw new Error("Policy tenant_isolation not found on maint.position_history");
  }
});

// Test: Expected columns exist
test("expected columns present", async (client) => {
  const result = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'maint' AND table_name = 'position_history'
  `);
  const columns = result.rows.map(r => r.column_name);
  const expected = [
    'id', 'operating_company_id', 'unit_id', 'unit_type', 'position_set_id',
    'position_code', 'part_id', 'part_number', 'action', 'action_reason',
    'actor_id', 'actor_name', 'action_at', 'source_type', 'source_id',
    'notes', 'created_at'
  ];
  const missing = expected.filter(col => !columns.includes(col));
  if (missing.length > 0) {
    throw new Error(`Missing columns: ${missing.join(', ')}`);
  }
});

// Test: Grants to ih35_app exist
test("grants to ih35_app exist", async (client) => {
  const result = await client.query(`
    SELECT grantee, privilege_type 
    FROM information_schema.table_privileges 
    WHERE table_schema = 'maint' AND table_name = 'position_history'
    AND grantee = 'ih35_app'
  `);
  const privileges = result.rows.map(r => r.privilege_type);
  const expected = ['SELECT', 'INSERT'];
  const missing = expected.filter(p => !privileges.includes(p));
  if (missing.length > 0) {
    throw new Error(`Missing ih35_app grants: ${missing.join(', ')}`);
  }
});

// Test: Indexes exist for common queries
test("indexes exist", async (client) => {
  const result = await client.query(`
    SELECT indexname FROM pg_indexes 
    WHERE schemaname = 'maint' AND tablename = 'position_history'
  `);
  const indexes = result.rows.map(r => r.indexname);
  const expected = [
    'idx_position_history_company',
    'idx_position_history_unit',
    'idx_position_history_position',
    'idx_position_history_part'
  ];
  const missing = expected.filter(idx => !indexes.some(i => i.includes(idx)));
  if (missing.length > 0) {
    throw new Error(`Missing indexes: ${missing.join(', ')}`);
  }
});

// Test: Foreign key constraints exist
// Detection uses pg_constraint (system catalog, visible regardless of role) instead of
// information_schema.constraint_column_usage, which Postgres filters to tables the connecting
// role OWNS. As ih35_app (non-owner of the referenced tables) that join returned 0 even though
// the FKs exist — failing this guard locally while passing in CI (owner role). pg_constraint
// reports the real count for any role.
test("foreign key constraints exist", async (client) => {
  const result = await client.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'maint.position_history'::regclass
      AND contype = 'f'
  `);
  const fks = result.rows.map(r => r.conname);
  if (fks.length === 0) {
    throw new Error("No foreign key constraints found");
  }
});

// Run all tests
console.log("Running M2 Integrity Position History verification...\n");
await runTests();

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nverify:m2-integrity-position-history FAILED");
  process.exit(1);
}

console.log("\nverify:m2-integrity-position-history OK");
process.exit(0);
