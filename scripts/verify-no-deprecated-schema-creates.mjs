#!/usr/bin/env node
/**
 * verify-no-deprecated-schema-creates — STRUCTURAL GATE against schema fragmentation. Several
 * concepts have a canonical schema and a near-empty deprecated twin. This blocks any NEW
 * `CREATE TABLE <deprecated>.x` in db/migrations so the duplication can't grow; consolidating the
 * EXISTING ones is CAS-04 (design-first) — this guard only stops new growth.
 *
 * DEPRECATED list confirmed 2026-06-28 by table count (canonical twin has clearly more tables):
 *   master_data (mdata 43 vs 4) · bank (banking 8 vs 1) · reporting (reports 8 vs 2) ·
 *   maint (maintenance 33 vs 5) · geofence (geo 3 vs 2).
 * AMBIGUOUS pairs left to CAS-04 (NOT blocked, to avoid blocking a canonical schema):
 *   factor/factoring (4/5) · settlement/settlements (3/1) · docs/documents (2/2).
 *
 * Ratchet: allowlist of any existing CREATE TABLE in a deprecated schema (may only shrink); any
 * NEW one fails CI. Run --write-baseline once.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = path.join(ROOT, "db/migrations");
const ALLOW_FILE = path.join(ROOT, "scripts/deprecated-schema-creates-allowlist.json");
const WRITE = process.argv.includes("--write-baseline");
const DEPRECATED = ["master_data", "bank", "reporting", "maint", "geofence"];

const re = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?(${DEPRECATED.join("|")})"?\\.("?[a-z_][a-z0-9_]*"?)`, "gi");

const hits = [];
for (const f of fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort()) {
  const src = fs.readFileSync(path.join(MIG, f), "utf8");
  for (const m of src.matchAll(re)) {
    hits.push(`${f}: CREATE TABLE ${m[1].toLowerCase()}.${m[2].replace(/"/g, "").toLowerCase()}`);
  }
}
const uniq = [...new Set(hits)].sort();

if (WRITE) {
  fs.writeFileSync(ALLOW_FILE, JSON.stringify({ note: "Existing CREATE TABLE in deprecated schemas (ratchet — may only shrink; consolidation = CAS-04).", deprecated: DEPRECATED, allow: uniq }, null, 2) + "\n");
  console.log(`verify-no-deprecated-schema-creates: wrote allowlist with ${uniq.length} existing deprecated-schema create(s) → ${path.relative(ROOT, ALLOW_FILE)}`);
  process.exit(0);
}

let allow = new Set();
try { allow = new Set(JSON.parse(fs.readFileSync(ALLOW_FILE, "utf8")).allow); } catch { /* none */ }
const neu = uniq.filter((h) => !allow.has(h));
const fixed = [...allow].filter((a) => !uniq.includes(a));
if (fixed.length) {
  console.log(`verify-no-deprecated-schema-creates: ${fixed.length} allowlisted create(s) gone — drop them (list must shrink):`);
  for (const f of fixed) console.log("  ✓ cleared: " + f);
}
if (neu.length) {
  console.error("verify-no-deprecated-schema-creates FAILED:");
  console.error(`  ${neu.length} NEW CREATE TABLE in a DEPRECATED schema (${DEPRECATED.join(", ")}) — use the canonical schema instead:`);
  for (const h of neu) console.error("  " + h);
  process.exit(1);
}
console.log(uniq.length
  ? `verify-no-deprecated-schema-creates OK — no NEW deprecated-schema creates. ${uniq.length} pre-existing (allowlisted; CAS-04 consolidates).`
  : `verify-no-deprecated-schema-creates OK — no CREATE TABLE in deprecated schemas (${DEPRECATED.join(", ")}).`);
