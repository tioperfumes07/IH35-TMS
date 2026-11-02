#!/usr/bin/env node
/**
 * verify-no-insurance-lawsuit-refs — ENG-60 (Claude Lead, 2026-11-02).
 *
 * Owner 10-24 (LEAD 443.332): lawsuits live ONLY in Legal as legal.matters type 'lawsuit'. Migration 202616310100
 * drops insurance.lawsuit, legal.matters.insurance_lawsuit_id and insurance.claim.lawsuit_id (0 rows / 0 links, all
 * entities, measured live 2026-11-02). Any surviving code reference is either a runtime SQL error waiting to happen or
 * a second system creeping back. This guard fails on every CODE-level reference in apps/ and scripts/:
 *   FROM/JOIN/INTO/UPDATE insurance.lawsuit · insurance_lawsuit_id · insurance.claim lawsuit_id writes ·
 *   insurance/lawsuit.routes · /api/v1/insurance/lawsuits · LawsuitCreateModal · insuranceLawsuitsApi ·
 *   EntityPicker kind "insurance_lawsuit" · registerInsuranceLawsuitRoutes.
 * Migrations (history) and this file are excluded. Comments that say "retired" are not code and do not match.
 *
 * Usage: node scripts/verify-no-insurance-lawsuit-refs.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-insurance-lawsuit-refs";
const SELF = "scripts/verify-no-insurance-lawsuit-refs.mjs";
const SCAN_DIRS = ["apps/backend/src", "apps/frontend/src", "apps/driver-pwa/src", "packages", "scripts"];
const EXTS = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "migrations"]);
/** Guards that name the retired surface ONLY to assert it stays gone (negative assertions / planted-regression
 *  fixtures). Fixed list — adding a file here needs the same reason, never a runtime reference. */
/** The 410-Gone stub (Cursor #27984 + Claude ENG-60): these files may NAME the retired route / path / registration so a
 *  stale client gets an explicit 410 + /legal/lawsuits — but SQL on insurance.lawsuit and the dropped columns stay
 *  forbidden in them too. Fixed list. */
export const GONE_STUB_FILES = new Map([
  ["apps/backend/src/insurance/lawsuit.routes.ts", new Set(["retired API path", "retired route registration"])],
  ["apps/backend/src/insurance/lawsuit.routes.test.ts", new Set(["retired API path", "retired route registration", "retired route module"])],
  ["apps/backend/src/index.ts", new Set(["retired route module", "retired route registration"])],
  ["scripts/verify-insurance-lawsuit-create-truth.mjs", new Set(["retired API path", "retired route module"])],
  ["scripts/verify-insurance-lawsuit-update-truth.mjs", new Set(["retired API path", "retired route module"])],
  ["scripts/money-pr-local-gate.mjs", new Set(["retired route module"])],
]);
export const ABSENCE_ASSERTING_GUARDS = new Set([
  "scripts/verify-legal-matter-lawsuit-linkage.mjs",
  "scripts/verify-legal-matter-claim-picker-create.mjs",
  "scripts/verify-legal-matter-claim-linkage.mjs",
]);

export const PATTERNS = [
  ["SQL on insurance.lawsuit", /\b(?:FROM|JOIN|INTO|UPDATE)\s+insurance\.lawsuit\b/i],
  ["dropped column insurance_lawsuit_id", /\binsurance_lawsuit_id\b/],
  ["dropped column insurance.claim.lawsuit_id", /\b(?:ic|claim|c)\.lawsuit_id\b/],
  ["retired route module", /insurance\/lawsuit\.routes/],
  ["retired API path", /\/api\/v1\/insurance\/lawsuits\b/],
  ["retired modal", /\bLawsuitCreateModal\b/],
  ["retired API client", /\binsuranceLawsuitsApi\b|\b(?:list|create|update)InsuranceLawsuits?\b/],
  ["retired picker kind", /kind=["']insurance_lawsuit["']|\binsurance_lawsuit:\s*\{/],
  ["retired route registration", /\bregisterInsuranceLawsuitRoutes\b/],
];

/** Pure: code lines only (line comments and block-comment lines are not code). */
export function codeHits(rel, src) {
  const hits = [];
  let inBlock = false;
  src.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (inBlock) { if (trimmed.includes("*/")) inBlock = false; return; }
    if (trimmed.startsWith("/*")) { if (!trimmed.includes("*/")) inBlock = true; return; }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    const code = line.replace(/\/\/.*$/, "");
    const allowed = GONE_STUB_FILES.get(rel);
    for (const [name, re] of PATTERNS) if (re.test(code) && !allowed?.has(name)) hits.push(`${rel}:${i + 1} ${name}`);
  });
  return hits;
}

function walk(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (EXTS.has(path.extname(e.name)) && rel !== SELF && !ABSENCE_ASSERTING_GUARDS.has(rel)) out.push(rel);
  }
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["SQL FROM caught", codeHits("x.ts", "const q = `SELECT 1 FROM insurance.lawsuit WHERE id=$1`;").length === 1],
    ["JOIN caught", codeHits("x.ts", "LEFT JOIN insurance.lawsuit lw ON lw.id = m.x").length === 1],
    ["dropped column caught", codeHits("x.ts", "push(\"insurance_lawsuit_id\", v);").length === 1],
    ["claim lawsuit_id caught", codeHits("x.ts", "SELECT ic.lawsuit_id FROM insurance.claim ic").length === 1],
    ["modal import caught", codeHits("x.tsx", 'import { LawsuitCreateModal } from "./x";').length === 1],
    ["picker kind caught", codeHits("x.tsx", '<EntityPicker kind="insurance_lawsuit" />').length === 1],
    ["API path caught", codeHits("x.ts", 'apiRequest("/api/v1/insurance/lawsuits")').length === 1],
    ["line comment ignored", codeHits("x.ts", "// insurance.lawsuit retired (ENG-60)").length === 0],
    ["block comment ignored", codeHits("x.ts", "/**\n * FROM insurance.lawsuit was retired\n */").length === 0],
    ["UI redirect route not a hit", codeHits("x.tsx", '<Navigate to={`/legal/lawsuits${search}`} />').length === 0],
    ["410 stub may name its own path", codeHits("apps/backend/src/insurance/lawsuit.routes.ts", 'app.get("/api/v1/insurance/lawsuits", h)').length === 0],
    ["410 stub may NOT query the table", codeHits("apps/backend/src/insurance/lawsuit.routes.ts", "await q(`SELECT * FROM insurance.lawsuit`)").length === 1],
    ["legal.matters lawsuit type not a hit", codeHits("x.ts", "WHERE type = 'lawsuit' FROM legal.matters").length === 0],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const files = [];
for (const d of SCAN_DIRS) walk(d, files);
const hits = files.flatMap((rel) => codeHits(rel, fs.readFileSync(path.join(ROOT, rel), "utf8")));
if (hits.length) {
  console.error(`${LABEL} FAIL — ${hits.length} code reference(s) to the retired insurance.lawsuit surface (${files.length} files scanned):`);
  for (const h of hits) console.error(`  ✗ ${h}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — 0 code references to insurance.lawsuit / insurance_lawsuit_id / lawsuit routes / LawsuitCreateModal (${files.length} files scanned)`);
