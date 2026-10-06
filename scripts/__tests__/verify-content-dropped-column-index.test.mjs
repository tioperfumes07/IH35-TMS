import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyMigrationContent } from "../lib/migration-content-verifier.mjs";

// ROUND 433: an index built on a column a LATER migration drops is gone with the column (Postgres drops dependent
// indexes) — not drift. It still is drift when the column exists, or when the index's own column was never dropped.
function migrationsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-content-dropcol-"));
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

function client({ columns = new Set(), indexes = new Set() } = {}) {
  return {
    async query(sql, params = []) {
      const lower = sql.toLowerCase();
      if (lower.includes("from information_schema.schemata")) return { rows: [{}] };
      if (lower.includes("from information_schema.tables")) return { rows: [{}] };
      if (lower.includes("from information_schema.columns")) {
        const [schema, table, column] = params;
        return { rows: columns.has(`${schema}.${table}.${column}`) ? [{}] : [] };
      }
      if (lower.includes("from information_schema.views")) return { rows: [] };
      if (lower.includes("from pg_class c") && lower.includes("c.relkind = 'i'")) {
        const [schema, name] = params;
        return { rows: indexes.has(`${schema}.${name}`) ? [{}] : [] };
      }
      return { rows: [] };
    },
  };
}

const FILES = {
  "0001_create.sql": `CREATE TABLE IF NOT EXISTS ins.policy (id uuid, tenant_id uuid, status text);
CREATE INDEX IF NOT EXISTS idx_policy_tenant_status ON ins.policy (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_policy_status ON ins.policy (status);`,
  "0002_drop.sql": `ALTER TABLE ins.policy DROP COLUMN IF EXISTS tenant_id;`,
};

const missingIndexes = (report) => report.report.flatMap((m) => m.missing.filter((x) => x.kind === "index").map((x) => x.fqin));

test("an index on a later-dropped, now-absent column is not drift", async () => {
  const dir = migrationsDir(FILES);
  const r = await verifyMigrationContent({
    client: client({ columns: new Set(["ins.policy.id", "ins.policy.status"]), indexes: new Set(["ins.idx_policy_status"]) }),
    migrationsDirectory: dir, minNumber: 1, maxNumber: Number.MAX_SAFE_INTEGER,
  });
  assert.deepEqual(missingIndexes(r), []);
  const skipped = r.report.flatMap((m) => m.skipped ?? []);
  assert.ok(skipped.some((s) => s.object === "ins.idx_policy_tenant_status" && /tenant_id dropped/.test(s.trace)));
});

test("the same index is drift when the column exists (dropped then re-added)", async () => {
  const dir = migrationsDir(FILES);
  const r = await verifyMigrationContent({
    client: client({ columns: new Set(["ins.policy.id", "ins.policy.status", "ins.policy.tenant_id"]), indexes: new Set(["ins.idx_policy_status"]) }),
    migrationsDirectory: dir, minNumber: 1, maxNumber: Number.MAX_SAFE_INTEGER,
  });
  assert.deepEqual(missingIndexes(r), ["ins.idx_policy_tenant_status"]);
});

test("an index whose columns were never dropped is still drift", async () => {
  const dir = migrationsDir(FILES);
  const r = await verifyMigrationContent({
    client: client({ columns: new Set(["ins.policy.id", "ins.policy.status"]), indexes: new Set() }),
    migrationsDirectory: dir, minNumber: 1, maxNumber: Number.MAX_SAFE_INTEGER,
  });
  assert.deepEqual(missingIndexes(r), ["ins.idx_policy_status"]);
});
