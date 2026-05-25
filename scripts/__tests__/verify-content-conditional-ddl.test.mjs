import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  parseConditionalGuardedTargets,
  verifyMigrationContent,
} from "../lib/migration-content-verifier.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fixturesRoot = path.resolve(root, "__tests__/fixtures/verify-content");

function key(parts) {
  return parts.join(".");
}

function makeMockClient({
  tables = new Set(),
  functions = new Set(),
  triggers = new Set(),
  indexes = new Set(),
} = {}) {
  return {
    async query(sql, params = []) {
      const lower = sql.toLowerCase();
      if (lower.includes("from information_schema.schemata")) {
        const [schema] = params;
        return { rows: schema === "public" || schema === "qa" ? [{}] : [] };
      }
      if (lower.includes("from information_schema.tables")) {
        const [schema, table] = params;
        return { rows: tables.has(key([schema, table])) ? [{}] : [] };
      }
      if (lower.includes("from information_schema.columns")) {
        return { rows: [] };
      }
      if (lower.includes("from information_schema.views")) {
        return { rows: [] };
      }
      if (lower.includes("from pg_proc p")) {
        const [schema, functionName] = params;
        return { rows: functions.has(key([schema, functionName])) ? [{}] : [] };
      }
      if (lower.includes("from pg_trigger t")) {
        const [schema, tableName, triggerName] = params;
        return { rows: triggers.has(key([schema, tableName, triggerName])) ? [{}] : [] };
      }
      if (lower.includes("from pg_class c") && lower.includes("c.relkind = 'i'")) {
        const [schema, indexName] = params;
        return { rows: indexes.has(key([schema, indexName])) ? [{}] : [] };
      }
      if (lower.includes("from pg_type t")) {
        return { rows: [] };
      }
      throw new Error(`Unhandled query in mock client: ${sql}`);
    },
  };
}

test("parses guarded DDL target metadata", async () => {
  const fixturePath = path.resolve(fixturesRoot, "conditional-skip-pass/0001_guarded_trigger.sql");
  const sql = await import("node:fs/promises").then((fs) => fs.readFile(fixturePath, "utf8"));
  const guarded = parseConditionalGuardedTargets(sql);
  assert.equal(guarded.length, 1);
  assert.equal(guarded[0].dependency.kind, "function");
  assert.equal(guarded[0].dependency.schema, "audit");
  assert.equal(guarded[0].dependency.name, "tg_audit_row");
  assert.equal(guarded[0].targets[0].kind, "trigger");
  assert.equal(guarded[0].targets[0].objectName, "qa.guard_target.tg_audit_guard_target");
});

test("conditional skip passes when dependency is absent and target is absent", async () => {
  const report = await verifyMigrationContent({
    client: makeMockClient({
      tables: new Set(["qa.guard_target"]),
      functions: new Set(),
      triggers: new Set(),
    }),
    migrationsDirectory: path.resolve(fixturesRoot, "conditional-skip-skip"),
  });
  assert.equal(report.totalMissing, 0);
  assert.equal(report.totalSkipped, 1);
  assert.equal(report.report[0].skipped[0].reason, "CONDITIONAL_SKIP");
});

test("conditional mismatch fails when dependency exists but guarded target is absent", async () => {
  const report = await verifyMigrationContent({
    client: makeMockClient({
      tables: new Set(["qa.guard_target"]),
      functions: new Set(["audit.tg_audit_row"]),
      triggers: new Set(),
    }),
    migrationsDirectory: path.resolve(fixturesRoot, "conditional-mismatch"),
  });
  assert.equal(report.totalMissing, 1);
  assert.equal(report.report[0].missing[0].kind, "trigger");
});

test("conditional mismatch fails when dependency is absent but guarded target exists", async () => {
  const report = await verifyMigrationContent({
    client: makeMockClient({
      tables: new Set(["qa.guard_target"]),
      functions: new Set(),
      triggers: new Set(["qa.guard_target.tg_audit_guard_target"]),
    }),
    migrationsDirectory: path.resolve(fixturesRoot, "conditional-mismatch"),
  });
  assert.equal(report.totalMissing, 1);
  assert.equal(report.report[0].missing[0].kind, "conditional_mismatch");
});
