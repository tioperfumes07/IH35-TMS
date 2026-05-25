import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { parseTransientObjects } from "../lib/migration-content-verifier.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fixturesRoot = path.resolve(root, "__tests__/fixtures/verify-content");

async function readFixture(relPath) {
  return fs.readFile(path.resolve(fixturesRoot, relPath), "utf8");
}

test("detects transient temp table", async () => {
  const sql = await readFixture("transient-temp-table/0001_temp_table.sql");
  const transient = parseTransientObjects(sql);
  assert.equal(transient.has("public.tmp_void_seed"), true);
});

test("detects create-then-drop helper function", async () => {
  const sql = await readFixture("transient-create-drop/0001_function_create_drop.sql");
  const transient = parseTransientObjects(sql);
  assert.equal(transient.has("qa.__seed_helper"), true);
});

test("does not mark persistent function as transient", async () => {
  const sql = await readFixture("persistent-create/0001_function_persistent.sql");
  const transient = parseTransientObjects(sql);
  assert.equal(transient.has("qa.__persistent_helper"), false);
});
