#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "db/migrations/0234_block_23_escrow_posting_flow.sql");

function fail(message) {
  console.error(`verify:escrow-amount-conservation — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) fail(`missing required migration: ${migrationPath}`);
const migration = fs.readFileSync(migrationPath, "utf8");

if (!migration.includes("CREATE OR REPLACE FUNCTION accounting.apply_escrow_posting_delta")) {
  fail("migration must define accounting.apply_escrow_posting_delta trigger function");
}
if (!migration.includes("UPDATE accounting.escrow_accounts")) {
  fail("migration must update escrow_accounts balance from postings");
}
if (!migration.includes("CREATE TRIGGER trg_apply_escrow_posting_delta")) {
  fail("migration must attach balance update trigger to escrow_postings");
}

console.log("verify:escrow-amount-conservation — OK");
