#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const file = new URL("../apps/backend/src/auth/db.ts", import.meta.url);
const source = fs.readFileSync(file, "utf8");

function verify(text) {
  assert.match(text, /function poolMax\(name: "DATABASE_POOL_MAX"\)/);
  assert.match(text, /if \(!raw\) return 5;/);
  assert.match(text, /parsed < 1 \|\| parsed > 10\)/);
  const maxHits = [...text.matchAll(/max: poolMax\("DATABASE_POOL_MAX"\)/g)];
  assert.equal(maxHits.length, 2, "app pool and luciaPool must both use DATABASE_POOL_MAX");
  assert.doesNotMatch(text, /DATABASE_DIRECT_POOL_MAX/);
  assert.doesNotMatch(text, /requireDatabaseDirectUrl/);
  assert.doesNotMatch(text, /buildLuciaConnString/);
  assert.match(text, /function buildLuciaPool[\s\S]*buildPgPoolConfig\(requireDatabaseUrl\(\)/);
  assert.match(text, /wrapLuciaPoolQueryInBypassTxn/);
  assert.match(text, /AUTH-LUCIA-SESSION-RLS/);
}

verify(source);

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("if (!raw) return 5;", "if (!raw) return 10;"),
    source.replace('max: poolMax("DATABASE_POOL_MAX")', "max: 10"),
    source.replace("parsed > 10", "parsed > 100"),
    source.replace(
      `buildPgPoolConfig(requireDatabaseUrl(), {
      max: poolMax("DATABASE_POOL_MAX"),
      idleTimeoutMillis: 30_000,`,
      `buildPgPoolConfig(requireDatabaseDirectUrl(), {
      max: poolMax("DATABASE_POOL_MAX"),
      idleTimeoutMillis: 30_000,`,
    ),
  ];
  mutations.forEach((mutation, index) => {
    let rejected = false;
    try {
      verify(mutation);
    } catch {
      rejected = true;
    }
    assert.ok(rejected, `mutation ${index + 1} was not rejected`);
  });
  console.log("verify-db-pool-budget selftest: PASS (4 mutations rejected)");
} else {
  console.log("verify-db-pool-budget: PASS");
}
