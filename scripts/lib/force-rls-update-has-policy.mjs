#!/usr/bin/env node
/**
 * GUARD (ROUND 441.21-B R2): FORCE-RLS tables that the app UPDATEs must authorize UPDATE.
 *
 * Measured defect (prod 2026-10-07): integrations.integration_sync_log had FORCE RLS, an INSERT
 * policy, a SELECT policy, and NO UPDATE policy. Every completion UPDATE matched 0 rows; Postgres
 * reported success — 14 ticks, 0 completions. Migration 202615440400 added the UPDATE policy.
 *
 * This guard fails on that CLASS of silent failure:
 *   FORCE RLS + app issues UPDATE + policies cover INSERT and/or SELECT + policies do NOT cover
 *   UPDATE (neither FOR UPDATE nor FOR ALL).
 *
 * Tables with FOR ALL (or FOR UPDATE) are fine. Tables never UPDATEd by the app are fine.
 * Hard requirement: integrations.integration_sync_log must keep its UPDATE (or ALL) policy.
 *
 * Invoked from scripts/verify-relay-tick-completes.mjs (R9) so it does not grow the orphan-guard census.
 * Run: node scripts/lib/force-rls-update-has-policy.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "force-rls-update-has-policy";
const MIG_DIR = path.join(ROOT, "db/migrations");
const BACKEND = path.join(ROOT, "apps/backend/src");
const ALWAYS = "integrations.integration_sync_log";

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith(".ts") || ent.name.endsWith(".sql")) acc.push(p);
  }
  return acc;
}

export function parseForcedTables(migrationsSql) {
  const forced = new Set([ALWAYS]);
  const re =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi;
  let m;
  while ((m = re.exec(migrationsSql))) forced.add(m[1].toLowerCase());
  return forced;
}

/** cmd → Set<table> for CREATE POLICY … FOR <cmd>. A policy with no FOR clause is ALL (Postgres default). */
export function parsePoliciesByCommand(migrationsSql) {
  const by = { select: new Set(), insert: new Set(), update: new Set(), all: new Set() };
  const withFor =
    /CREATE\s+POLICY\s+\w+\s+ON\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+FOR\s+(SELECT|INSERT|UPDATE|ALL)\b/gi;
  let m;
  while ((m = withFor.exec(migrationsSql))) {
    by[m[2].toLowerCase()].add(m[1].toLowerCase());
  }
  // CREATE POLICY name ON schema.table USING (...) — no FOR → ALL
  const noFor =
    /CREATE\s+POLICY\s+\w+\s+ON\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+(?!FOR\b)(?:AS\s+\w+\s+)?(?:TO\s+[\w,\s]+\s+)?USING\b/gi;
  while ((m = noFor.exec(migrationsSql))) {
    by.all.add(m[1].toLowerCase());
  }
  return by;
}

export function findUpdatedForcedTables(backendSrcByFile, forced) {
  const hit = new Map();
  for (const [file, src] of backendSrcByFile) {
    // Test fixtures that UPDATE under FORCE RLS are not the silent-prod class this guard locks.
    if (/\/__tests__\//.test(file) || /\.test\.ts$/.test(file) || /\.db\.test\.ts$/.test(file)) continue;
    for (const table of forced) {
      const [schema, name] = table.split(".");
      const full = new RegExp(`UPDATE\\s+(?:ONLY\\s+)?${schema}\\.${name}\\b`, "i");
      if (full.test(src)) {
        if (!hit.has(table)) hit.set(table, []);
        hit.get(table).push(path.relative(ROOT, file));
      }
    }
  }
  return hit;
}

function coversUpdate(by, table) {
  return by.update.has(table) || by.all.has(table);
}

export function problems(migrationsSql, backendSrcByFile) {
  const forced = parseForcedTables(migrationsSql);
  const by = parsePoliciesByCommand(migrationsSql);
  const updated = findUpdatedForcedTables(backendSrcByFile, forced);
  const p = [];

  if (!coversUpdate(by, ALWAYS)) {
    p.push(`${ALWAYS} has no FOR UPDATE / FOR ALL policy (RELAY-F440 / 441.21-B R2 measured defect)`);
  }

  for (const [table, files] of updated) {
    if (coversUpdate(by, table)) continue;
    const hasInsertOrSelect = by.insert.has(table) || by.select.has(table);
    // The silent class: RLS allows write-ish ops (INSERT) and/or read, but not UPDATE — UPDATE matches 0.
    if (!hasInsertOrSelect) continue;
    p.push(
      `${table} is FORCE RLS, UPDATEd in ${files.slice(0, 3).join(", ")}${
        files.length > 3 ? ` (+${files.length - 3})` : ""
      }, has INSERT/SELECT policy, but no UPDATE/ALL — silent 0-row UPDATE class`
    );
  }
  return p;
}

function loadMigrationsSql() {
  return fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIG_DIR, f), "utf8"))
    .join("\n");
}

function loadBackendSources() {
  return walk(BACKEND)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, fs.readFileSync(f, "utf8")]);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const migrationsSql = loadMigrationsSql();
  const backendSrc = loadBackendSources();

  if (process.argv.includes("--selftest")) {
    const real = problems(migrationsSql, backendSrc);
    if (real.length) {
      console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
      process.exit(1);
    }
    const stripped = migrationsSql.replace(
      /CREATE\s+POLICY\s+\w+\s+ON\s+integrations\.integration_sync_log\s+FOR\s+(UPDATE|ALL)[\s\S]*?;/gi,
      "-- stripped UPDATE policy"
    );
    const planted = problems(stripped, backendSrc);
    if (!planted.some((x) => x.includes(ALWAYS))) {
      console.error(`${LABEL} --selftest FAIL — stripping sync_log UPDATE policy was not caught`);
      process.exit(1);
    }
    console.log(
      `${LABEL} --selftest PASS — real tree clean; plant caught (FORCE RLS + INSERT/SELECT + UPDATE in code needs UPDATE/ALL policy)`
    );
    process.exit(0);
  }

  const probs = problems(migrationsSql, backendSrc);
  if (probs.length) {
    console.error(`${LABEL}: FAIL — ${probs.length} issue(s):`);
    for (const x of probs) console.error(`  ✗ ${x}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — FORCE-RLS tables the app UPDATEs with INSERT/SELECT-only policies are refused; ${ALWAYS} has UPDATE`
  );
}
