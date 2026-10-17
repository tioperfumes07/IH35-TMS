#!/usr/bin/env node
/**
 * LEAD 443.191 (CC-3): every user-schema view ends security_invoker=true, else it reads with the view OWNER's rights
 * and bypasses the caller's row-level security (cross-company leak). The live check is
 * apps/backend/src/audit/__tests__/live-defects-f1-f3.db.test.ts (F3), which only runs on a migrated database.
 * Measured before this step: 202616000100_factoring_views_exclude_voided_advances.sql (5fd5b44af3, #26850) re-created
 * views.factoring_recourse_at_risk + views.factoring_chargebacks_fees with CREATE OR REPLACE VIEW and no
 * WITH (security_invoker = true). CREATE OR REPLACE VIEW replaces the view's options with the ones it names, so both
 * lost the option (prod read-only 2026-10-17: exactly those 2 views without it).
 *
 * THIS STEP (static, no database): replays db/migrations in runner order — CREATE [OR REPLACE] VIEW sets the option from
 * its own WITH clause (absent = off), ALTER VIEW … SET/RESET (security_invoker) changes it, RENAME / SET SCHEMA moves it,
 * DROP VIEW forgets it, and the 202606271500 sweep (ALTER VIEW %I.%I SET (security_invoker = true) over every view) turns
 * every view known at that point on. Any view still off at the end fails.
 * --selftest plants each regression.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = resolve(ROOT, "db/migrations");

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const norm = (n) => {
  const s = n.replace(/"/g, "").trim().toLowerCase();
  return s.includes(".") ? s : `public.${s}`;
};
const NAME = String.raw`((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)`;
const invokerOn = (opts) => /security_invoker\s*=\s*'?(?:true|on|1)'?/i.test(opts ?? "");
const invokerOff = (opts) => /security_invoker\s*=\s*'?(?:false|off|0)'?/i.test(opts ?? "");

const RULES = [
  ["create", new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?(?:RECURSIVE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}\s*(?:\([^)]*\)\s*)?(?:WITH\s*\(([^)]*)\)\s*)?AS\b`, "gi")],
  ["sweep", /ALTER\s+VIEW\s+%I\.%I\s+SET\s*\(\s*security_invoker\s*=\s*true\s*\)/gi],
  ["set", new RegExp(String.raw`\bALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?${NAME}\s+SET\s*\(([^)]*)\)`, "gi")],
  ["reset", new RegExp(String.raw`\bALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?${NAME}\s+RESET\s*\(([^)]*)\)`, "gi")],
  ["rename", new RegExp(String.raw`\bALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?${NAME}\s+RENAME\s+TO\s+("[^"]+"|\w+)`, "gi")],
  ["schema", new RegExp(String.raw`\bALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?${NAME}\s+SET\s+SCHEMA\s+("[^"]+"|\w+)`, "gi")],
  ["drop", /\bDROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?([^;]+?)\s*(?:CASCADE|RESTRICT)?\s*;/gi],
];

/** Pure replay: files = [[name, sql], …] in runner order → Map(view → { on, by }). */
export function replay(files) {
  const views = new Map();
  for (const [file, raw] of files) {
    const sql = stripComments(raw);
    const events = [];
    for (const [kind, re] of RULES) {
      re.lastIndex = 0;
      for (let m; (m = re.exec(sql)); ) events.push({ at: m.index, kind, m });
    }
    events.sort((a, b) => a.at - b.at);
    for (const { kind, m } of events) {
      if (kind === "create") views.set(norm(m[1]), { on: invokerOn(m[2]), by: file });
      else if (kind === "sweep") for (const v of views.values()) { v.on = true; v.by = file; }
      else if (kind === "set" && /security_invoker/i.test(m[2])) {
        const v = views.get(norm(m[1])) ?? { on: false, by: file };
        if (invokerOn(m[2])) v.on = true;
        else if (invokerOff(m[2])) v.on = false;
        v.by = file;
        views.set(norm(m[1]), v);
      } else if (kind === "reset" && /security_invoker/i.test(m[2])) {
        const v = views.get(norm(m[1]));
        if (v) Object.assign(v, { on: false, by: file });
      } else if (kind === "rename" || kind === "schema") {
        const from = norm(m[1]);
        const v = views.get(from);
        if (!v) continue;
        const [schema, rel] = from.split(".");
        const to = kind === "rename" ? `${schema}.${m[2].replace(/"/g, "").toLowerCase()}` : `${m[2].replace(/"/g, "").toLowerCase()}.${rel}`;
        views.delete(from);
        views.set(to, v);
      } else if (kind === "drop") for (const n of m[1].split(",")) views.delete(norm(n));
    }
  }
  return views;
}

export function offenders(files) {
  return [...replay(files)].filter(([, v]) => !v.on).map(([name, v]) => `${name} (last set by ${v.by})`).sort();
}

const migrationFiles = () =>
  readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort().map((f) => [f, readFileSync(resolve(DIR, f), "utf8")]);

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = migrationFiles();
  if (offenders(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", offenders(base));
    process.exit(1);
  }
  const plant = (n, sql) => [n, [...base, ["999999999999_plant.sql", sql]]];
  const plants = [
    plant("CREATE OR REPLACE VIEW without the option", "CREATE OR REPLACE VIEW views.factoring_recourse_at_risk AS SELECT 1;"),
    plant("new view without the option", "CREATE VIEW views.plant_x AS SELECT 1;"),
    plant("option turned off", "ALTER VIEW views.factoring_chargebacks_fees SET (security_invoker = false);"),
    plant("option reset", "ALTER VIEW IF EXISTS views.factoring_chargebacks_fees RESET (security_invoker);"),
    plant("off view renamed keeps off", "CREATE VIEW views.plant_y AS SELECT 1; ALTER VIEW views.plant_y RENAME TO plant_z;"),
  ];
  for (const [n, files] of plants) {
    if (!offenders(files).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  const okPlants = [
    plant("WITH clause keeps it on", "CREATE OR REPLACE VIEW views.plant_ok WITH (security_invoker = true) AS SELECT 1;"),
    plant("ALTER after CREATE turns it on", "CREATE VIEW plant_ok2 AS SELECT 1;\nALTER VIEW public.plant_ok2 SET (security_invoker = true);"),
    plant("dropped off view is gone", "CREATE VIEW views.plant_gone AS SELECT 1; DROP VIEW IF EXISTS views.plant_gone CASCADE;"),
    plant("comment-only mention ignored", "-- CREATE OR REPLACE VIEW views.factoring_recourse_at_risk AS SELECT 1;\nSELECT 1;"),
  ];
  for (const [n, files] of okPlants) {
    if (offenders(files).length) {
      console.error(`SELFTEST FAIL: clean plant "${n}" flagged`, offenders(files));
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught, ${okPlants.length} clean plants pass`);
  process.exit(0);
}
if (isMain) {
  const files = migrationFiles();
  const bad = offenders(files);
  if (bad.length) {
    console.error(`verify-views-keep-security-invoker: FAIL — ${bad.length} view(s) end without security_invoker=true (reads bypass the caller's RLS):`);
    for (const b of bad) console.error(`  ✗ ${b}`);
    console.error("Fix: CREATE OR REPLACE VIEW … WITH (security_invoker = true) AS …, or ALTER VIEW … SET (security_invoker = true) in a new migration.");
    process.exit(1);
  }
  console.log(`verify-views-keep-security-invoker: OK — ${replay(files).size} views replayed from ${files.length} migrations, all security_invoker=true.`);
}
