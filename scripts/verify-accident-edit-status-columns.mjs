#!/usr/bin/env node
/**
 * Guard for 0441-mod6-accident-edit-500-status-silent-fail.
 *
 * ROOT: safety.accident_reports lacked status + updated_at; PATCH edit/status SET updated_at 42703'd;
 * the status route swallowed the DB error via .catch(() => ({ rows: [] })) → silent 404.
 *
 * Asserts:
 *  1. Migration 202607580000 adds status + updated_at + chk_accident_reports_status.
 *  2. PATCH /accidents/:id/status UPDATE is NOT wrapped in .catch that masks failures.
 *  3. PATCH /accidents/:id still sets updated_at on edit (needs the column).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accident-edit-status-columns";
const MIGRATION = "db/migrations/202607580000_accident_reports_status_updated_at.sql";
const ROUTES = "apps/backend/src/safety/safety.routes.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1);
}

export function assertGuard({ migration, routes }) {
  const errs = [];
  if (!/ADD COLUMN IF NOT EXISTS status/.test(migration)) {
    errs.push(`${MIGRATION}: must ADD COLUMN status`);
  }
  if (!/ADD COLUMN IF NOT EXISTS updated_at/.test(migration)) {
    errs.push(`${MIGRATION}: must ADD COLUMN updated_at`);
  }
  if (!/chk_accident_reports_status/.test(migration)) {
    errs.push(`${MIGRATION}: must add chk_accident_reports_status CHECK`);
  }

  const r = stripComments(routes);
  const statusBlock = r.match(
    /app\.patch\("\/api\/v1\/safety\/accidents\/:id\/status"[\s\S]*?return updated;\s*\}\);/
  );
  if (!statusBlock) {
    errs.push(`${ROUTES}: missing PATCH /accidents/:id/status handler`);
  } else if (/\.catch\s*\(\s*\(\s*\)\s*=>\s*\(\{\s*rows:\s*\[\]/.test(statusBlock[0])) {
    errs.push(`${ROUTES}: status UPDATE must not .catch(() => ({ rows: [] })) — surfaces silent 404 on 500`);
  }
  if (!/updated_at\s*=\s*now\(\)/.test(r)) {
    errs.push(`${ROUTES}: accident PATCH must SET updated_at = now()`);
  }

  return errs;
}

function selftest() {
  const goodMigration = `
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    chk_accident_reports_status
  `;
  const goodRoutes = `
    app.patch("/api/v1/safety/accidents/:id/status", async () => {
      const res = await client.query("UPDATE safety.accident_reports SET status = $2, updated_at = now()");
      return updated;
    });
    app.patch("/api/v1/safety/accidents/:id", async () => {
      SET foo = $1, updated_at = now()
    });
  `;
  const badRoutes = `
    app.patch("/api/v1/safety/accidents/:id/status", async () => {
      const res = await client.query("UPDATE safety.accident_reports SET status = $2, updated_at = now()")
        .catch(() => ({ rows: [] }));
      return updated;
    });
    app.patch("/api/v1/safety/accidents/:id", async () => {
      SET foo = $1, updated_at = now()
    });
  `;

  const cases = [
    { n: "good → 0", in: { migration: goodMigration, routes: goodRoutes }, want: 0 },
    { n: "missing status col → flag", in: { migration: "updated_at only", routes: goodRoutes }, min: 1 },
    { n: "status .catch swallow → flag", in: { migration: goodMigration, routes: badRoutes }, min: 1 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${f}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const migPath = path.join(ROOT, MIGRATION);
const routesPath = path.join(ROOT, ROUTES);
if (!fs.existsSync(migPath)) {
  console.error(`[${LABEL}] FAILED — missing ${MIGRATION}`);
  process.exit(1);
}
if (!fs.existsSync(routesPath)) {
  console.error(`[${LABEL}] FAILED — missing ${ROUTES}`);
  process.exit(1);
}

const errs = assertGuard({
  migration: fs.readFileSync(migPath, "utf8"),
  routes: fs.readFileSync(routesPath, "utf8"),
});
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — accident_reports status/updated_at migration present; status route no longer swallows DB errors.`);
