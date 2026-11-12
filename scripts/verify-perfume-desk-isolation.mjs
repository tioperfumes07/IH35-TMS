#!/usr/bin/env node
/**
 * PERFUME-DESK ISOLATION (owner order 2026-11-11/12: "isolate in a hidden module … we do not cross with USMCA data").
 *
 * The TIO Perfumes price desk lives in IH35-TMS but belongs to a different company. This guard keeps it
 * from ever touching a carrier:
 *   1. db/migrations/*perfume*.sql — no operating_company_id, no REFERENCES outside perfume.* and
 *      identity.users, FORCE ROW LEVEL SECURITY on every perfume table, DELETE granted only on
 *      perfume.needs and perfume.brand_aliases (price lists are voided, items merged — never deleted).
 *   2. apps/backend/src/perfume/*.ts (non-test) — SQL names only perfume.* / identity.* schemas and imports
 *      nothing from a carrier or accounting module.
 *   3. apps/backend/src/perfume/desk.routes.ts — every route handler starts with the Owner-only check.
 *
 *   node scripts/verify-perfume-desk-isolation.mjs              check
 *   node scripts/verify-perfume-desk-isolation.mjs --selftest   proves each rule catches a planted breach
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-perfume-desk-isolation";
const MIGRATIONS = path.join(ROOT, "db", "migrations");
const BACKEND = path.join(ROOT, "apps", "backend", "src", "perfume");
const ALLOWED_DELETE = new Set(["needs", "brand_aliases"]);
const CARRIER_SCHEMAS = ["accounting", "mdata", "org", "banking", "bank", "driver_finance", "dispatch", "catalogs", "maintenance", "maint",
  "settlement", "payroll", "fuel", "factoring", "insurance", "legal", "compliance", "safety", "fleet", "integrations", "docs", "email", "audit"];
const CARRIER_IMPORT = /from\s+["']\.\.\/(accounting|banking|bank|driver-finance|dispatch|mdata|catalogs|maintenance|maint|settlements?|fuel|factoring|insurance|legal|compliance|fleet|bills|invoices|org)\b/;

const stripSqlComments = (s) => s.replace(/--[^\n]*/g, "");

export function checkMigration(name, sql) {
  const errs = [];
  const s = stripSqlComments(sql);
  if (/operating_company_id/i.test(s)) errs.push(`${name}: perfume tables must not carry operating_company_id`);
  for (const m of s.matchAll(/REFERENCES\s+([a-z_]+)\.([a-z_]+)/gi)) {
    const ref = `${m[1]}.${m[2]}`.toLowerCase();
    if (m[1].toLowerCase() !== "perfume" && ref !== "identity.users") errs.push(`${name}: REFERENCES ${ref} — perfume may reference only perfume.* and identity.users`);
  }
  const tables = [...s.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+perfume\.([a-z_]+)/gi)].map((m) => m[1].toLowerCase());
  const loop = s.match(/FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\s*\[([^\]]*)\]\s*LOOP([\s\S]*?)END\s+LOOP/i);
  const loopTables = loop ? [...loop[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
  const loopForces = loop ? /FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(loop[2]) && /perfume\.%I/i.test(loop[2]) : false;
  for (const t of tables) {
    const literal = new RegExp(`ALTER\\s+TABLE\\s+perfume\\.${t}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(s);
    if (!literal && !(loopForces && loopTables.includes(t))) errs.push(`${name}: perfume.${t} has no FORCE ROW LEVEL SECURITY`);
  }
  for (const m of s.matchAll(/GRANT\s+([A-Z ,]+)\s+ON\s+([^;]+?)\s+TO/gi)) {
    if (!/DELETE/i.test(m[1])) continue;
    for (const obj of m[2].split(",").map((x) => x.trim().replace(/^perfume\./i, "").toLowerCase())) {
      if (!ALLOWED_DELETE.has(obj) && obj !== "perfume.%i" && !obj.includes("%i")) errs.push(`${name}: DELETE granted on perfume.${obj} — price data is voided or merged, never deleted`);
    }
  }
  if (loop && /GRANT[^']*DELETE/i.test(loop[2])) errs.push(`${name}: the RLS loop grants DELETE on every perfume table`);
  return errs;
}

export function checkBackendFile(name, src) {
  const errs = [];
  const m = src.match(CARRIER_IMPORT);
  if (m) errs.push(`${name}: imports carrier/accounting module ../${m[1]}`);
  // SQL lives in template / string literals; any "<carrier schema>.<table>" inside one is a crossing.
  const literals = [...src.matchAll(/`([^`]*)`|"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1] ?? x[2] ?? "");
  for (const lit of literals) {
    for (const sch of CARRIER_SCHEMAS) {
      const re = new RegExp(`\\b${sch}\\.[a-z_]+\\b`, "i");
      if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|JOIN|INTO)\b/i.test(lit) && re.test(lit)) errs.push(`${name}: SQL names ${sch}.* — perfume reads/writes perfume.* only`);
    }
  }
  return errs;
}

export function checkRoutes(name, src) {
  const errs = [];
  for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\(\s*"([^"]+)"[^]*?async\s*\(req,\s*reply\)\s*=>\s*\{\s*([^\n]*)/g)) {
    if (!/ownerOnly\(req,\s*reply\)/.test(m[3])) errs.push(`${name}: ${m[1].toUpperCase()} ${m[2]} does not start with ownerOnly(req, reply)`);
  }
  if (!/role\s*\?\?\s*""\)\s*!==\s*"Owner"/.test(src)) errs.push(`${name}: ownerOnly no longer checks role === "Owner"`);
  return errs;
}

function run() {
  const errs = [];
  const migs = fs.readdirSync(MIGRATIONS).filter((f) => /perfume/i.test(f) && f.endsWith(".sql"));
  if (!migs.length) errs.push("no perfume migration found");
  for (const f of migs) errs.push(...checkMigration(f, fs.readFileSync(path.join(MIGRATIONS, f), "utf8")));
  const files = fs.existsSync(BACKEND) ? fs.readdirSync(BACKEND).filter((f) => f.endsWith(".ts") && !f.includes(".test.")) : [];
  if (!files.includes("desk.routes.ts")) errs.push("apps/backend/src/perfume/desk.routes.ts missing");
  for (const f of files) {
    const src = fs.readFileSync(path.join(BACKEND, f), "utf8");
    errs.push(...checkBackendFile(f, src));
    if (f === "desk.routes.ts") errs.push(...checkRoutes(f, src));
  }
  if (errs.length) {
    console.error(`${LABEL} FAIL — ${errs.length} breach(es):\n  - ${errs.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — ${migs.length} migration(s), ${files.length} backend file(s): no carrier/USMCA/GL reference, FORCE RLS on every perfume table, Owner-only routes, no DELETE on price data`);
}

function selftest() {
  const good = `CREATE TABLE IF NOT EXISTS perfume.items (id uuid, created_by uuid REFERENCES identity.users(id));
    ALTER TABLE perfume.items FORCE ROW LEVEL SECURITY; GRANT SELECT, INSERT ON perfume.items TO ih35_app; GRANT DELETE ON perfume.needs TO ih35_app;`;
  const cases = [
    ["clean migration passes", checkMigration("m", good).length === 0],
    ["operating_company_id caught", checkMigration("m", good + " ALTER TABLE perfume.items ADD COLUMN operating_company_id uuid;").length > 0],
    ["REFERENCES org.companies caught", checkMigration("m", good.replace("identity.users", "org.companies")).length > 0],
    ["missing FORCE RLS caught", checkMigration("m", good.replace("FORCE ROW LEVEL SECURITY", "ENABLE ROW LEVEL SECURITY")).length > 0],
    ["DELETE on price data caught", checkMigration("m", good + " GRANT DELETE ON perfume.price_lists TO ih35_app;").length > 0],
    ["carrier SQL caught", checkBackendFile("f.ts", "await c.query(`SELECT id FROM mdata.vendors`)").length > 0],
    ["carrier import caught", checkBackendFile("f.ts", 'import { post } from "../accounting/poster.js";').length > 0],
    ["perfume SQL passes", checkBackendFile("f.ts", "await c.query(`SELECT id FROM perfume.items JOIN identity.users u ON true`)").length === 0],
    ["route without owner check caught", checkRoutes("r.ts", 'const x = (req.user?.role ?? "") !== "Owner";\napp.get("/api/v1/perfume/x", async (req, reply) => {\n    return 1;\n  });').length > 0],
    ["route with owner check passes", checkRoutes("r.ts", 'const x = (req.user?.role ?? "") !== "Owner";\napp.get("/api/v1/perfume/x", async (req, reply) => {\n    const uid = ownerOnly(req, reply); if (!uid) return;\n  });').length === 0],
  ];
  const bad = cases.filter(([, ok]) => !ok);
  for (const [n] of bad) console.error(`  FAIL: ${n}`);
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED — ${bad.length} of ${cases.length}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} cases`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
