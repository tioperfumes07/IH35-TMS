import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/db-verify-rls-cross-tenant-gate.mjs");

test("runtime gate script exists with required guardrails", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /RLS missing for table/);
  assert.match(source, /pg_policy/);
  assert.match(source, /relrowsecurity/);
  assert.match(source, /INSERT INTO org\.companies/);
  assert.match(source, /set_config\('app\.operating_company_id', ''/);
  assert.match(source, /failed default-deny check/);
});

test("runtime gate source enforces db URL requirement", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /DATABASE_DIRECT_URL or DATABASE_URL required/);
});
