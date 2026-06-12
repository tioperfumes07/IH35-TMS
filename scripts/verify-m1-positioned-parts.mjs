#!/usr/bin/env node
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  const isCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  if (isCi) {
    console.error("DATABASE_URL required in CI");
    process.exit(1);
  }
  console.log("SKIP: DATABASE_URL not set (local dev)");
  process.exit(0);
}

const client = new Client(buildPgClientConfig(url));

async function verify() {
  await client.connect();
  let passed = 0;
  let failed = 0;

  const checks = [
    { name: "maint.position_set table", sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = 'maint' AND table_name = 'position_set'" },
    { name: "maint.part_position_assignment table", sql: "SELECT 1 FROM information_schema.tables WHERE table_schema = 'maint' AND table_name = 'part_position_assignment'" },
    { name: "position_set RLS enabled", sql: "SELECT relrowsecurity FROM pg_class WHERE relname = 'position_set' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'maint')" },
    { name: "part_position_assignment RLS enabled", sql: "SELECT relrowsecurity FROM pg_class WHERE relname = 'part_position_assignment' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'maint')" },
    { name: "position_set_tenant_isolation policy", sql: "SELECT 1 FROM pg_policies WHERE schemaname = 'maint' AND tablename = 'position_set' AND policyname = 'position_set_tenant_isolation'" },
    { name: "part_position_assignment_tenant_isolation policy", sql: "SELECT 1 FROM pg_policies WHERE schemaname = 'maint' AND tablename = 'part_position_assignment' AND policyname = 'part_position_assignment_tenant_isolation'" },
    { name: "maint.part.position_set_id column", sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = 'maint' AND table_name = 'part' AND column_name = 'position_set_id'" },
    { name: "maint.part.requires_position column", sql: "SELECT 1 FROM information_schema.columns WHERE table_schema = 'maint' AND table_name = 'part' AND column_name = 'requires_position'" },
    { name: "Default position sets seeded", sql: "SELECT COUNT(*) FROM maint.position_set WHERE code LIKE 'truck-%' OR code LIKE 'trailer-%'" }
  ];

  for (const check of checks) {
    try {
      const result = await client.query(check.sql);
      if (result.rows.length > 0 || (result.rows[0] && result.rows[0].count > 0)) {
        console.log(`✓ ${check.name}`);
        passed++;
      } else {
        console.log(`✗ ${check.name} - NOT FOUND`);
        failed++;
      }
    } catch (e) {
      console.log(`✗ ${check.name} - ERROR: ${e.message}`);
      failed++;
    }
  }

  await client.end();
  console.log(`\n${passed}/${checks.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
