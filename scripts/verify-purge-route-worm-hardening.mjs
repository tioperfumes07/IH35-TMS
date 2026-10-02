#!/usr/bin/env node
/**
 * THE PERMANENT DELETE ROUTE STAYS HARDENED (Lead ROUND 331 / 334 — CC-1, migration 202615290200).
 *
 * accounting.refuse_financial_row_delete() backs every WORM table (80 on prod 2026-10-02, 81 with
 * audit.record_deletions). The held 202615210200 resolved its ARM C function with
 * 'accounting.delete_cancelled_load_revrec(...)'::regprocedure — a cast that THROWS when the function is absent, so
 * a dropped or not-yet-created revrec function would have broken every DELETE in the database at once. The fix is
 * to_regprocedure(), which returns NULL and simply closes ARM C. Proven on fork br-proud-glade-akwc6rbb: with the
 * function dropped, a DELETE on accounting.journal_entries gets the ordinary WORM refusal, not an error.
 *
 * Rules, each fails the push — read from the migration that defines each object LAST (the effective definition):
 *   1. refuse_financial_row_delete resolves functions with to_regprocedure(); no ::regprocedure cast in its body.
 *   2. every migration that still carries the ::regprocedure body is in a .held-migrations.json section, so the
 *      runner can never auto-apply it on prod after the hardened definition.
 *   3. _purge_rows_cascade resolves the child column by matching confkey to the parent's id (never conkey[1] — the
 *      composite FK dispatch.load_charge_lines (load_id, operating_company_id) made conkey[1] pick the company
 *      column) and DETACHES driver_finance.escrow_ledger (driver money held in trust) instead of deleting it.
 *   4. purge_cross_entity_load and _purge_rows_cascade are REVOKEd from PUBLIC (owner role only), and
 *      audit.record_deletions / _system.purge_authorized_rows are REVOKEd from PUBLIC — prod's default privileges
 *      otherwise hand PUBLIC UPDATE on the forensic record and SELECT on the owner's authorization list.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = resolve(ROOT, "db/migrations");
const LABEL = "verify-purge-route-worm-hardening";

const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

/** Body of `CREATE OR REPLACE FUNCTION <name>(` up to its closing dollar-quote, or null. */
export function functionBody(sql, name) {
  const at = sql.search(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${name.replace(".", "\\.")}\\s*\\(`, "i"));
  if (at < 0) return null;
  const rest = sql.slice(at);
  const tag = rest.match(/AS\s+(\$[A-Za-z_]*\$)/);
  if (!tag) return null;
  const start = rest.indexOf(tag[1]) + tag[1].length;
  const end = rest.indexOf(tag[1], start);
  return end < 0 ? null : rest.slice(start, end);
}

export function collectFailures({ files, read, heldFiles }) {
  const failures = [];
  const sorted = [...files].filter((f) => /^\d{12}_.*\.sql$/.test(f)).sort();
  const lastDefiner = (name) => {
    let found = null;
    for (const f of sorted) {
      const sql = stripSql(read(f));
      const body = functionBody(sql, name);
      if (body !== null) found = { file: f, sql, body };
    }
    return found;
  };

  // RULE 1
  const worm = lastDefiner("accounting.refuse_financial_row_delete");
  if (!worm) {
    failures.push("RULE 1: no migration defines accounting.refuse_financial_row_delete()");
  } else {
    if (/'[^']*'\s*::\s*regprocedure/i.test(worm.body)) {
      failures.push(
        `RULE 1: ${worm.file} — refuse_financial_row_delete casts a function name ::regprocedure. That cast THROWS when the\n` +
          `  function is absent and this trigger backs every WORM table: one missing function breaks every DELETE.\n` +
          `  Use to_regprocedure(), which returns NULL.`
      );
    }
    if (!/to_regprocedure\s*\(/i.test(worm.body)) {
      failures.push(`RULE 1: ${worm.file} — refuse_financial_row_delete no longer resolves ARM C with to_regprocedure().`);
    }
  }

  // RULE 2
  for (const f of sorted) {
    if (worm && f === worm.file) continue;
    const body = functionBody(stripSql(read(f)), "accounting.refuse_financial_row_delete");
    if (body && /'[^']*'\s*::\s*regprocedure/i.test(body) && !heldFiles.has(f)) {
      failures.push(
        `RULE 2: ${f} defines refuse_financial_row_delete with a ::regprocedure cast and is not in .held-migrations.json —\n` +
          `  the runner could apply it on prod and undo the to_regprocedure hardening.`
      );
    }
  }

  // RULE 3
  const cascade = lastDefiner("accounting._purge_rows_cascade");
  if (!cascade) {
    failures.push("RULE 3: no migration defines accounting._purge_rows_cascade()");
  } else {
    if (!/confkey\s*\[\s*i\s*\]\s*=\s*pr\.idnum/i.test(cascade.body) || /conkey\s*\[\s*1\s*\]/i.test(cascade.body)) {
      failures.push(
        `RULE 3: ${cascade.file} — _purge_rows_cascade must resolve the child column by matching confkey to the parent's id,\n` +
          `  never conkey[1]: the composite FK load_charge_lines (load_id, operating_company_id) picks the company column.`
      );
    }
    if (!/'driver_finance\.escrow_ledger'/.test(cascade.body)) {
      failures.push(
        `RULE 3: ${cascade.file} — driver_finance.escrow_ledger left the HUBS boundary. Driver escrow is money held in trust\n` +
          `  for the driver: the cascade DETACHES it, never deletes it.`
      );
    }
  }

  // RULE 4
  const purge = lastDefiner("accounting.purge_cross_entity_load");
  if (!purge) failures.push("RULE 4: no migration defines accounting.purge_cross_entity_load()");
  const revoke = (sql, sig) => new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${sig}\\s*\\([^)]*\\)\\s+FROM\\s+PUBLIC`, "i").test(sql);
  if (purge && !revoke(purge.sql, "accounting\\.purge_cross_entity_load")) {
    failures.push(`RULE 4: ${purge.file} — purge_cross_entity_load is not REVOKEd from PUBLIC (owner role only).`);
  }
  if (cascade && !revoke(cascade.sql, "accounting\\._purge_rows_cascade")) {
    failures.push(`RULE 4: ${cascade.file} — _purge_rows_cascade is not REVOKEd from PUBLIC (owner role only).`);
  }
  if (purge) {
    for (const t of ["audit\\.record_deletions", "_system\\.purge_authorized_rows"]) {
      if (!new RegExp(`REVOKE\\s+ALL\\s+ON\\s+${t}\\s+FROM\\s+PUBLIC`, "i").test(purge.sql)) {
        failures.push(`RULE 4: ${purge.file} — ${t.replace("\\", "")} is not REVOKEd from PUBLIC (prod default privileges grant it).`);
      }
    }
  }
  return failures;
}

export function run() {
  const held = JSON.parse(readFileSync(resolve(MIG, ".held-migrations.json"), "utf8"));
  const heldFiles = new Set(Object.values(held).filter(Array.isArray).flat().map((h) => h?.file).filter(Boolean));
  return collectFailures({ files: readdirSync(MIG), read: (f) => readFileSync(resolve(MIG, f), "utf8"), heldFiles });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const good = `CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete() RETURNS trigger AS $fn$ BEGIN v := to_regprocedure('x(uuid)'); END $fn$;`;
    const bad = `CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete() RETURNS trigger AS $fn$ BEGIN v := 'x(uuid)'::regprocedure; END $fn$;`;
    const rest =
      `CREATE OR REPLACE FUNCTION accounting._purge_rows_cascade(p text) RETURNS bigint AS $fn$ /* conkey[1] */ WHERE k.confkey[i] = pr.idnum 'driver_finance.escrow_ledger' $fn$;` +
      `REVOKE ALL ON FUNCTION accounting._purge_rows_cascade(text) FROM PUBLIC;` +
      `CREATE OR REPLACE FUNCTION accounting.purge_cross_entity_load(p uuid) RETURNS jsonb AS $fn$ x $fn$;` +
      `REVOKE ALL ON FUNCTION accounting.purge_cross_entity_load(uuid) FROM PUBLIC; REVOKE ALL ON audit.record_deletions FROM PUBLIC; REVOKE ALL ON _system.purge_authorized_rows FROM PUBLIC;`;
    const mk = (m) => ({ files: Object.keys(m), read: (f) => m[f], heldFiles: new Set() });
    const cases = [
      ["hardened passes", collectFailures(mk({ "202601010000_a.sql": good + rest })).length === 0],
      ["::regprocedure fails", collectFailures(mk({ "202601010000_a.sql": bad + rest })).some((f) => f.startsWith("RULE 1"))],
      ["unheld older ::regprocedure fails", collectFailures(mk({ "202601010000_a.sql": bad, "202601020000_b.sql": good + rest })).some((f) => f.startsWith("RULE 2"))],
      ["held older ::regprocedure passes", collectFailures({ ...mk({ "202601010000_a.sql": bad, "202601020000_b.sql": good + rest }), heldFiles: new Set(["202601010000_a.sql"]) }).length === 0],
      ["conkey[1] fails", collectFailures(mk({ "202601010000_a.sql": good + rest.replace("k.confkey[i] = pr.idnum", "k.conkey[1]") })).some((f) => f.startsWith("RULE 3"))],
      ["escrow deleted fails", collectFailures(mk({ "202601010000_a.sql": good + rest.replace("'driver_finance.escrow_ledger'", "") })).some((f) => f.startsWith("RULE 3"))],
      ["PUBLIC execute fails", collectFailures(mk({ "202601010000_a.sql": good + rest.replace("REVOKE ALL ON FUNCTION accounting.purge_cross_entity_load(uuid) FROM PUBLIC;", "") })).some((f) => f.startsWith("RULE 4"))],
    ];
    const bad_ = cases.filter(([, ok]) => !ok);
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    console.log(bad_.length ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad_.length ? 1 : 0);
  }
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL}: FAIL\n`);
    for (const f of failures) console.error(`  ${f}\n`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — ARM C resolves with to_regprocedure, the ::regprocedure body is held, the cascade matches confkey and detaches escrow, the route is owner-only.`);
}
