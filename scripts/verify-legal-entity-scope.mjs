#!/usr/bin/env node
/**
 * verify-legal-entity-scope.mjs — entity-independence guard for the legal schema.
 *
 * Every base table in schema `legal` MUST be entity-scoped: have an operating_company_id column AND have
 * row-level security enabled. This keeps lease-to-own contracts (and all legal data) isolated per
 * operating company — a contract under entity A is never visible under entity B. Part of the
 * entity-independence guard family.
 *
 * Real static assert (no DB): scans db/migrations, finds every `CREATE TABLE [IF NOT EXISTS] legal.<t>`,
 * asserts (a) operating_company_id appears inside that CREATE block, and (b) an
 * `ALTER TABLE legal.<t> ENABLE ROW LEVEL SECURITY` exists somewhere in the migrations. Exit 1 on any gap.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG = path.join(ROOT, "db", "migrations");

function main() {
  const files = fs.existsSync(MIG) ? fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort() : [];
  const corpus = files.map((f) => fs.readFileSync(path.join(MIG, f), "utf8")).join("\n");

  // find each CREATE TABLE legal.<name> ( ... ) block
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?legal\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
  const tables = [];
  let m;
  while ((m = createRe.exec(corpus)) !== null) {
    tables.push({ name: m[1], body: m[2] });
  }
  if (tables.length === 0) {
    console.log("[legal-entity-scope] PASS — no legal.* base tables found (nothing to scope).");
    process.exit(0);
  }

  const violations = [];
  const seen = new Set();
  for (const t of tables) {
    if (seen.has(t.name)) continue; // a table may be re-CREATEd IF NOT EXISTS; check once
    seen.add(t.name);
    const hasOci = /\boperating_company_id\b/i.test(t.body);
    const rlsRe = new RegExp(`alter\\s+table\\s+legal\\.${t.name}\\s+enable\\s+row\\s+level\\s+security`, "i");
    const hasRls = rlsRe.test(corpus);
    if (!hasOci) violations.push(`legal.${t.name} — missing operating_company_id (not entity-scoped)`);
    if (!hasRls) violations.push(`legal.${t.name} — missing ENABLE ROW LEVEL SECURITY`);
  }

  if (violations.length === 0) {
    console.log(`[legal-entity-scope] PASS — all ${seen.size} legal.* tables are entity-scoped (operating_company_id + RLS).`);
    process.exit(0);
  }
  console.error("\nLEGAL ENTITY-SCOPE GUARD FAILED");
  console.error("=".repeat(60));
  console.error("Every legal.* table must have operating_company_id + RLS (entity independence):");
  for (const v of violations) console.error(`  - ${v}`);
  console.error("=".repeat(60));
  process.exit(1);
}
main();
