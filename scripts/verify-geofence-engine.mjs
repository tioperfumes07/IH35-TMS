#!/usr/bin/env node
/**
 * verify-geofence-engine.mjs — W3A-GEOFENCE-ENGINE guard (Node built-ins only)
 */
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
let failures = 0;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failures++;
}
function pass(msg) {
  console.log(`  PASS: ${msg}`);
}
function expectFile(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) { fail(`Missing file: ${rel}`); return null; }
  pass(`File exists: ${rel}`);
  return readFileSync(p, "utf8");
}
function expectContains(content, pattern, label) {
  const ok = typeof pattern === "string" ? content.includes(pattern) : pattern.test(content);
  ok ? pass(label) : fail(label);
}
function expectNotContains(content, pattern, label) {
  const ok = typeof pattern === "string" ? !content.includes(pattern) : !pattern.test(content);
  ok ? pass(label) : fail(label);
}

console.log("\n── W3A-GEOFENCE-ENGINE verification ──\n");

// C1: migration exists
const migration = expectFile("db/migrations/202606111200_w3a_geofence_engine.sql");
if (migration) {
  expectContains(migration, "CREATE SCHEMA IF NOT EXISTS geofence", "migration: CREATE SCHEMA IF NOT EXISTS geofence");
  expectContains(migration, "CREATE TABLE IF NOT EXISTS geofence.fence", "migration: geofence.fence table");
  expectContains(migration, "CREATE TABLE IF NOT EXISTS geofence.event", "migration: geofence.event table");
  expectContains(migration, "ENABLE ROW LEVEL SECURITY", "migration: RLS enabled");
  expectContains(migration, "geofence.log_event_to_spine", "migration: spine trigger function");
  expectContains(migration, "events.log_event(", "migration: calls events.log_event()");
  expectContains(migration, "event_type", "migration: event_type column");
  expectNotContains(migration, /cron\.schedule|node-cron|initializeSamsaraPositionsCron/, "migration: does not duplicate samsara cron code");
  expectNotContains(migration, /INSERT INTO integrations\.samsara/, "migration: does not write to samsara tables");
}

// C2: grants file with CREATE SCHEMA guard
const grants = expectFile("db/migrations/202606111103_w3a_geofence_schema_grants.sql");
if (grants) {
  expectContains(grants, "CREATE SCHEMA IF NOT EXISTS geofence", "grants: CREATE SCHEMA IF NOT EXISTS guard");
  expectContains(grants, "GRANT USAGE ON SCHEMA geofence", "grants: USAGE grant");
}

// C3: routes file
const routes = expectFile("apps/backend/src/geofence/geofence.routes.ts");
if (routes) {
  expectContains(routes, "geofence/fences", "routes: /geofence/fences endpoint");
  expectContains(routes, "geofence/events", "routes: /geofence/events endpoint");
  expectContains(routes, "requireAuth", "routes: requireAuth used");
  expectContains(routes, "geofence.fence", "routes: queries geofence.fence");
  expectContains(routes, "geofence.event", "routes: queries geofence.event");
}

// C4: ci.yml wired
const ci = expectFile(".github/workflows/ci.yml");
if (ci) {
  expectContains(ci, "verify:geofence-engine", "ci.yml: verify:geofence-engine step present");
}

// C5: package.json script
const pkg = expectFile("package.json");
if (pkg) {
  expectContains(pkg, "verify:geofence-engine", "package.json: verify:geofence-engine script present");
}

// C6: manifest
const manifest = expectFile(".block-ready/W3A-GEOFENCE-ENGINE.json");
if (manifest) {
  const m = JSON.parse(manifest);
  expectContains(m.block_id, "W3A-GEOFENCE-ENGINE", "manifest: block_id correct");
}

console.log(`\n── Result: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ──\n`);
if (failures > 0) process.exit(1);
