#!/usr/bin/env node
// verify:per-entity-only-flag-gates — FLAG-HARDEN-1 permanent guard.
//
// ROOT CAUSE it locks down: setting rollout_pct=100 on RATECON_EXTRACT_ENABLED had ZERO effect — the
// extract endpoint calls isEnabled with only operating_company_id (no user_uuid), so the user-hash
// rollout branch never evaluates; and where a user_uuid IS present, a percentage rollout is cross-entity
// by design. Per-entity, owner-gated features must therefore be enabled ONLY via an explicit per-entity
// (tenant) or per-user override — never a global default/rollout that silently no-ops or leaks across
// entities. This guard fails the build if any static invariant of that protection is removed:
//   1. service.ts declares the PER_ENTITY_ONLY_FLAG_KEYS registry + isPerEntityGatedFlag helper.
//   2. resolveFlagEnabled short-circuits per-entity-gated flags to OFF (isPerEntityGatedFlag) BEFORE the
//      rollout/default fallback — so global rollout/default can never enable them.
//   3. the PATCH route rejects a global enable for BOTH registries (posting + per-entity-only).
//   4. registry coverage: any flag whose seeding migration description contains "per-entity" MUST be
//      enumerated in PER_ENTITY_ONLY_FLAG_KEYS or POSTING_FLAG_KEYS (else it silently falls through to
//      the global rollout/default path — the exact defect).

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = path.join(ROOT, "apps/backend/src/lib/feature-flags/service.ts");
const ROUTES = path.join(ROOT, "apps/backend/src/lib/feature-flags/routes.ts");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");

const failures = [];
function read(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    failures.push(`missing file: ${path.relative(ROOT, p)}`);
    return "";
  }
}

// Extract the double-quoted keys inside a `<NAME> ... new Set([ ... ])` literal in service.ts.
function extractSetKeys(src, name) {
  const startTok = `${name}`;
  const at = src.indexOf(startTok);
  if (at === -1) return null;
  const open = src.indexOf("new Set([", at);
  if (open === -1) return null;
  const close = src.indexOf("])", open);
  if (close === -1) return null;
  const body = src.slice(open, close);
  return new Set([...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

const service = read(SERVICE);
let postingKeys = new Set();
let perEntityKeys = new Set();
if (service) {
  // (1) registry + helper present
  const pe = extractSetKeys(service, "PER_ENTITY_ONLY_FLAG_KEYS");
  const po = extractSetKeys(service, "POSTING_FLAG_KEYS");
  if (!pe) failures.push("service.ts missing PER_ENTITY_ONLY_FLAG_KEYS registry (new Set([...]))");
  else perEntityKeys = pe;
  if (!po) failures.push("service.ts missing POSTING_FLAG_KEYS registry (new Set([...]))");
  else postingKeys = po;

  if (!/export function isPerEntityOnlyFlag\s*\(/.test(service))
    failures.push("service.ts missing isPerEntityOnlyFlag() helper");
  if (!/export function isPerEntityGatedFlag\s*\(/.test(service))
    failures.push("service.ts missing isPerEntityGatedFlag() helper (posting OR per-entity-only)");

  // (2) resolver short-circuits per-entity-gated flags to OFF before the rollout/default fallback.
  const resolverIdx = service.indexOf("export function resolveFlagEnabled");
  const gateIdx = service.indexOf("isPerEntityGatedFlag(flag.flag_key)");
  const rolloutIdx = service.indexOf("isRolloutEnabled(flag.flag_key");
  if (resolverIdx === -1 || gateIdx === -1)
    failures.push("resolveFlagEnabled must short-circuit per-entity-gated flags via isPerEntityGatedFlag(flag.flag_key)");
  else if (rolloutIdx !== -1 && gateIdx > rolloutIdx)
    failures.push("resolveFlagEnabled: the isPerEntityGatedFlag() OFF short-circuit must come BEFORE the rollout/default fallback");
}

// (3) PATCH route rejects global enable for BOTH registries.
const routes = read(ROUTES);
if (routes) {
  if (!routes.includes("posting_flag_global_enable_forbidden"))
    failures.push("routes.ts PATCH lost the posting-flag global-enable rejection (posting_flag_global_enable_forbidden)");
  if (!routes.includes("per_entity_flag_global_enable_forbidden"))
    failures.push("routes.ts PATCH must reject a global enable for per-entity-only flags (per_entity_flag_global_enable_forbidden)");
  if (!/isPerEntityOnlyFlag\s*\(/.test(routes))
    failures.push("routes.ts PATCH must classify per-entity-only flags via isPerEntityOnlyFlag()");
}

// (4) migration-coverage: any flag seeded with a "per-entity" description must be in a registry.
let migrationFiles = [];
try {
  migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
} catch {
  failures.push("cannot read db/migrations");
}
for (const file of migrationFiles) {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  let searchFrom = 0;
  for (;;) {
    const ins = sql.indexOf("INSERT INTO lib.feature_flags", searchFrom);
    if (ins === -1) break;
    const end = sql.indexOf(";", ins);
    const stmt = sql.slice(ins, end === -1 ? undefined : end);
    searchFrom = end === -1 ? sql.length : end + 1;

    const keyMatch = stmt.match(/VALUES\s*\(\s*'([^']+)'/i);
    if (!keyMatch) continue;
    const flagKey = keyMatch[1];
    if (/per-entity/i.test(stmt)) {
      const covered = perEntityKeys.has(flagKey) || postingKeys.has(flagKey);
      if (!covered) {
        failures.push(
          `${file}: flag '${flagKey}' is seeded with a "per-entity" description but is NOT in PER_ENTITY_ONLY_FLAG_KEYS or POSTING_FLAG_KEYS — it would silently fall through to the global rollout/default path`
        );
      }
    }
  }
}

// (5) H3-2/H3-4: no RAW feature-flag reads outside the canonical resolver. A `SELECT ... FROM
//     lib.feature_flags` (or lib.feature_flag_overrides) anywhere but lib/feature-flags/* bypasses
//     isEnabled()/resolveFlagEnabled — so it silently skips per-entity/user overrides and the posting /
//     per-entity-only OFF short-circuit. That is exactly how the daily-recon (GL_POSTING_ENABLED) and
//     settlement (SETTLEMENT_CAPPED_RECOVERY_ENABLED) gates read `default_enabled` raw and missed
//     per-entity scoping. Every flag read MUST go through isEnabled(). This bans the anti-pattern from
//     regressing anywhere in the backend.
const BACKEND_SRC = path.join(ROOT, "apps/backend/src");
const CANONICAL_FLAG_DIR = path.join("lib", "feature-flags"); // the ONLY place allowed to query the tables
const RAW_FLAG_READ = /FROM\s+lib\.feature_flag/i; // matches lib.feature_flags AND lib.feature_flag_overrides

function walkTsFiles(dir, acc) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walkTsFiles(full, acc);
    } else if (ent.isFile() && ent.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

for (const file of walkTsFiles(BACKEND_SRC, [])) {
  const rel = path.relative(ROOT, file);
  // The canonical resolver + admin CRUD legitimately query the tables; tests may seed them directly.
  if (rel.includes(path.join("apps/backend/src", CANONICAL_FLAG_DIR))) continue;
  if (/\.test\.ts$/.test(file) || file.includes(`${path.sep}__tests__${path.sep}`)) continue;
  const src = readFileSync(file, "utf8");
  if (RAW_FLAG_READ.test(src)) {
    failures.push(
      `${rel}: raw feature-flag read (\`FROM lib.feature_flag...\`) outside lib/feature-flags — route it through isEnabled(key, { operating_company_id }) so per-entity/user overrides + the posting OFF short-circuit apply`
    );
  }
}

if (failures.length > 0) {
  console.error("verify:per-entity-only-flag-gates — FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("verify:per-entity-only-flag-gates — OK (per-entity-only flag class enforced: no silent rollout no-ops, no global enables)");
