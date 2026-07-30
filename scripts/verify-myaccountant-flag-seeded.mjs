#!/usr/bin/env node
/**
 * verify-myaccountant-flag-seeded.mjs (0441-mod7-myaccountant-flag-no-seed)
 *
 * Root cause this locks down: apps/frontend/src/pages/accounting/MyAccountantPage.tsx gates itself via
 * useFeatureFlag("MY_ACCOUNTANT_ENABLED", opco), but no db/migrations/ row ever seeded that key into
 * lib.feature_flags. Because lib.feature_flag_overrides.flag_key has an FK to lib.feature_flags(flag_key),
 * an un-seeded flag can never receive a per-entity override — the owner cannot turn it on for even one
 * entity, and it is invisible in the admin Feature Flags manager. This guard fails the build if:
 *
 *   1. No migration seeds MY_ACCOUNTANT_ENABLED into lib.feature_flags.
 *   2. The seed does not default OFF (default_enabled false / no explicit true).
 *   3. MY_ACCOUNTANT_ENABLED is not enrolled in PER_ENTITY_ONLY_FLAG_KEYS (service.ts) — required
 *      because it is a per-entity read-only surface; without enrollment a global default_enabled/
 *      rollout_pct flip could light it up for EVERY entity (incl. USMCA / TRK) at once.
 *   4. MyAccountantPage.tsx stops gating on the MY_ACCOUNTANT_ENABLED flag via useFeatureFlag.
 *
 * Usage:
 *   node scripts/verify-myaccountant-flag-seeded.mjs            # scan
 *   node scripts/verify-myaccountant-flag-seeded.mjs --selftest # exercises pass + violation fixtures
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-myaccountant-flag-seeded";
const FLAG_KEY = "MY_ACCOUNTANT_ENABLED";
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const SERVICE = path.join(ROOT, "apps/backend/src/lib/feature-flags/service.ts");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/accounting/MyAccountantPage.tsx");

function findSeedMigration() {
  let files = [];
  try {
    files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch {
    return { file: null, sql: null, error: "cannot read db/migrations" };
  }
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    if (sql.includes("INSERT INTO lib.feature_flags") && sql.includes(`'${FLAG_KEY}'`)) {
      return { file, sql, error: null };
    }
  }
  return { file: null, sql: null, error: null };
}

function extractSetKeys(src, name) {
  const at = src.indexOf(name);
  if (at === -1) return null;
  const open = src.indexOf("new Set([", at);
  if (open === -1) return null;
  const close = src.indexOf("])", open);
  if (close === -1) return null;
  return new Set([...src.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

export function checkSeedMigration({ file, sql, error }) {
  const failures = [];
  if (error) {
    failures.push(error);
    return failures;
  }
  if (!file) {
    failures.push(
      `no migration seeds '${FLAG_KEY}' into lib.feature_flags — MyAccountantPage's gate is un-manageable (no per-entity override possible, invisible in admin Feature Flags manager)`
    );
    return failures;
  }
  const ins = sql.indexOf("INSERT INTO lib.feature_flags");
  const end = sql.indexOf(";", ins);
  const stmt = sql.slice(ins, end === -1 ? undefined : end);
  if (/default_enabled\s*[,)]?\s*\)?\s*VALUES[^;]*true/i.test(stmt.replace(/\s+/g, " "))) {
    // crude but sufficient: reject an explicit `true` in the same VALUES tuple as the flag key
  }
  const valuesMatch = stmt.match(/VALUES\s*\(([^)]*)\)/i);
  if (valuesMatch && /\btrue\b/.test(valuesMatch[1])) {
    failures.push(`${file}: '${FLAG_KEY}' must seed default_enabled = false (found 'true' in the VALUES tuple)`);
  }
  if (!/ON CONFLICT\s*\(flag_key\)\s*DO NOTHING/i.test(sql)) {
    failures.push(`${file}: seed must be idempotent (ON CONFLICT (flag_key) DO NOTHING)`);
  }
  return failures;
}

export function checkPerEntityRegistry(serviceSrc) {
  const failures = [];
  if (!serviceSrc) {
    failures.push("missing apps/backend/src/lib/feature-flags/service.ts");
    return failures;
  }
  const perEntityKeys = extractSetKeys(serviceSrc, "PER_ENTITY_ONLY_FLAG_KEYS");
  if (!perEntityKeys) {
    failures.push("service.ts missing PER_ENTITY_ONLY_FLAG_KEYS registry (new Set([...]))");
    return failures;
  }
  if (!perEntityKeys.has(FLAG_KEY)) {
    failures.push(
      `service.ts: '${FLAG_KEY}' must be enrolled in PER_ENTITY_ONLY_FLAG_KEYS — without it a global default_enabled/rollout_pct flip could enable the surface for EVERY entity (incl. USMCA / TRK) at once`
    );
  }
  return failures;
}

export function checkPageGate(pageSrc) {
  const failures = [];
  if (!pageSrc) {
    failures.push("missing apps/frontend/src/pages/accounting/MyAccountantPage.tsx");
    return failures;
  }
  if (!new RegExp(`useFeatureFlag\\(\\s*["']${FLAG_KEY}["']`).test(pageSrc)) {
    failures.push(`MyAccountantPage.tsx must gate on useFeatureFlag("${FLAG_KEY}", ...)`);
  }
  if (!/if\s*\(\s*!\s*flagLoading\s*&&\s*!\s*enabled\s*\)|if\s*\(\s*!\s*enabled\s*\)/.test(pageSrc)) {
    failures.push("MyAccountantPage.tsx must render a disabled/OFF branch guarding the workspace");
  }
  return failures;
}

export function run() {
  const seed = findSeedMigration();
  const serviceSrc = fs.existsSync(SERVICE) ? fs.readFileSync(SERVICE, "utf8") : null;
  const pageSrc = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, "utf8") : null;

  const failures = [
    ...checkSeedMigration(seed),
    ...checkPerEntityRegistry(serviceSrc),
    ...checkPageGate(pageSrc),
  ];

  // ACCT-R-10 scoreboard leaf (Rule 24) — must run before PASS return
  try {
    const acct = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/module-completion/accounting.json"), "utf8"));
    const leaf = (acct.items || []).find((i) => i.id === "ACCT-R-10");
    if (!leaf || leaf.status !== "PASS") {
      failures.push("docs/module-completion/accounting.json missing ACCT-R-10 PASS leaf");
    }
  } catch (e) {
    failures.push(`accounting.json unreadable: ${e.message}`);
  }

  if (failures.length) {
    console.error(`[${LABEL}] FAIL — ${FLAG_KEY} is not correctly seeded / gated:`);
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }

  console.log(`[${LABEL}] PASS — ${FLAG_KEY} seeded (default OFF), per-entity-only enrolled, page gate wired`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const goodSql = `BEGIN;\nINSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_KEY}', 'desc', false)\nON CONFLICT (flag_key) DO NOTHING;\nCOMMIT;\n`;
  const badTrueSql = `BEGIN;\nINSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_KEY}', 'desc', true)\nON CONFLICT (flag_key) DO NOTHING;\nCOMMIT;\n`;
  const badNoConflictSql = `BEGIN;\nINSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_KEY}', 'desc', false);\nCOMMIT;\n`;

  const cases = [
    { name: "good seed (default OFF, idempotent)", failures: checkSeedMigration({ file: "x.sql", sql: goodSql, error: null }), expectPass: true },
    { name: "seed defaults to true", failures: checkSeedMigration({ file: "x.sql", sql: badTrueSql, error: null }), expectPass: false },
    { name: "seed not idempotent", failures: checkSeedMigration({ file: "x.sql", sql: badNoConflictSql, error: null }), expectPass: false },
    { name: "no seed found at all", failures: checkSeedMigration({ file: null, sql: null, error: null }), expectPass: false },
    {
      name: "registry enrolled",
      failures: checkPerEntityRegistry(`export const PER_ENTITY_ONLY_FLAG_KEYS = new Set([\n  "${FLAG_KEY}",\n]);`),
      expectPass: true,
    },
    {
      name: "registry missing key",
      failures: checkPerEntityRegistry(`export const PER_ENTITY_ONLY_FLAG_KEYS = new Set([\n  "OTHER_FLAG",\n]);`),
      expectPass: false,
    },
    {
      name: "page gated",
      failures: checkPageGate(`const { enabled, loading: flagLoading } = useFeatureFlag("${FLAG_KEY}", opco);\nif (!flagLoading && !enabled) { return null; }`),
      expectPass: true,
    },
    {
      name: "page not gated",
      failures: checkPageGate(`export function MyAccountantPage() { return <div />; }`),
      expectPass: false,
    },
  ];

  let failed = false;
  for (const c of cases) {
    const passed = c.failures.length === 0;
    if (passed !== c.expectPass) {
      failed = true;
      console.error(`[${LABEL}] SELFTEST FAIL — "${c.name}" expected ${c.expectPass ? "PASS" : "FAIL"} but got ${passed ? "PASS" : "FAIL"}`);
      for (const f of c.failures) console.error(`    - ${f}`);
    }
  }
  if (failed) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS — accepts correct seed/registry/gate; rejects each defect independently`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
