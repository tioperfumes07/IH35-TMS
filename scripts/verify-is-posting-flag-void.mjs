#!/usr/bin/env node
// verify:is-posting-flag-void — 0091-H3-3 permanent guard.
//
// ROOT CAUSE it locks down: isPostingFlag() (apps/backend/src/lib/feature-flags/service.ts) recognized
// `*_GL_POSTING(_ENABLED)?$` and `*_POSTING_ENABLED$` as posting-class (per-entity-only — never a global
// default/rollout enable) but had NO `_VOID_ENABLED$` branch. VOID_ENFORCEMENT_ENABLED (invoice/bill void
// reversal, void.service.ts) and WO_VOID_ENABLED (work-order void's linked bill/expense reversal,
// work-orders.routes.ts) each gate a REAL balanced reversing-JE post (postVoidReversal) — the same
// money-safe mechanics as any other posting flag — yet fell through resolveFlagEnabled() to the global
// rollout/default path, unclassified. A single global default_enabled=true (or a 100% rollout_pct) on
// either flag would have posted reversing entries for EVERY entity (incl. USMCA / TRK), bypassing the
// per-entity money kill-switch that every other posting flag enforces. NO new GL math here —
// classification only; postVoidReversal itself is unchanged.
//
// This guard fails the build if any static invariant of that fix regresses:
//   1. isPostingFlag() has the `_VOID_ENABLED$` regex branch (auto-recognizes any future *_VOID_ENABLED key).
//   2. VOID_ENFORCEMENT_ENABLED + WO_VOID_ENABLED are enumerated in POSTING_FLAG_KEYS explicitly
//      (belt-and-suspenders — the pattern already covers them, but explicit enrollment survives a
//      future edit to the regex).
//   3. Both flags stay seeded default_enabled=false (DEFAULT OFF) in their migrations — a passing
//      classification guard must never be paired with an accidental global-ON seed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = path.join(ROOT, "apps/backend/src/lib/feature-flags/service.ts");
const VOID_ENFORCEMENT_MIGRATION = path.join(ROOT, "db/migrations/202606141200_void_enforcement_flag.sql");
const WO_VOID_MIGRATION = path.join(ROOT, "db/migrations/202606300040_per_entity_posting_flags.sql");

const VOID_FLAG_KEYS = ["VOID_ENFORCEMENT_ENABLED", "WO_VOID_ENABLED"];

function stripSql(src) {
  return src.replace(/--.*$/gm, "");
}
function seededDefaultOff(mig, key) {
  return new RegExp(`['"]${key}['"][\\s\\S]{0,700}?,\\s*false\\s*[,)]`).test(stripSql(mig));
}

// Extract the double-quoted keys inside a `<NAME> ... new Set([ ... ])` literal in service.ts.
function extractSetKeys(src, name) {
  const at = src.indexOf(name);
  if (at === -1) return null;
  const open = src.indexOf("new Set([", at);
  if (open === -1) return null;
  const close = src.indexOf("])", open);
  if (close === -1) return null;
  return new Set([...src.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

export function assertIsPostingFlagVoid({ service, voidEnforcementMigration, woVoidMigration }) {
  const errors = [];

  // (1) the regex branch itself — the actual defect (missing `_VOID_ENABLED$` branch in isPostingFlag()).
  const fnStart = service.indexOf("export function isPostingFlag");
  const fnEnd = fnStart === -1 ? -1 : service.indexOf("\n}", fnStart);
  const fnBody = fnStart === -1 || fnEnd === -1 ? "" : service.slice(fnStart, fnEnd);
  if (!fnBody) {
    errors.push("service.ts: isPostingFlag() function not found");
  } else if (!/_VOID_ENABLED\$/.test(fnBody)) {
    errors.push(
      "service.ts: isPostingFlag() is missing the `_VOID_ENABLED$` regex branch — *_VOID_ENABLED flags " +
        "(VOID_ENFORCEMENT_ENABLED, WO_VOID_ENABLED) fall through to the global rollout/default path"
    );
  }

  // (2) explicit belt-and-suspenders enrollment in POSTING_FLAG_KEYS.
  const postingKeys = extractSetKeys(service, "POSTING_FLAG_KEYS") ?? new Set();
  for (const key of VOID_FLAG_KEYS) {
    if (!postingKeys.has(key)) {
      errors.push(`service.ts: POSTING_FLAG_KEYS must explicitly enumerate '${key}' (belt-and-suspenders)`);
    }
  }

  // (3) both flags stay seeded default OFF.
  if (!seededDefaultOff(voidEnforcementMigration, "VOID_ENFORCEMENT_ENABLED")) {
    errors.push("202606141200_void_enforcement_flag.sql: VOID_ENFORCEMENT_ENABLED not seeded default_enabled=false");
  }
  if (!seededDefaultOff(woVoidMigration, "WO_VOID_ENABLED")) {
    errors.push("202606300040_per_entity_posting_flags.sql: WO_VOID_ENABLED not seeded default_enabled=false");
  }

  return errors;
}

if (process.argv.includes("--selftest")) {
  const goodService = `
export const POSTING_FLAG_KEYS: ReadonlySet<string> = new Set([
  "GL_POSTING_ENABLED",
  "VOID_ENFORCEMENT_ENABLED",
  "WO_VOID_ENABLED",
]);

export function isPostingFlag(flagKey: string): boolean {
  return (
    POSTING_FLAG_KEYS.has(flagKey) ||
    /_GL_POSTING(_ENABLED)?$/.test(flagKey) ||
    /_POSTING_ENABLED$/.test(flagKey) ||
    /_VOID_ENABLED$/.test(flagKey)
  );
}
`;
  const goodMigration = (key) =>
    `INSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${key}', 'desc', false);`;

  const good = assertIsPostingFlagVoid({
    service: goodService,
    voidEnforcementMigration: goodMigration("VOID_ENFORCEMENT_ENABLED"),
    woVoidMigration: goodMigration("WO_VOID_ENABLED"),
  });
  if (good.length !== 0) {
    console.error("SELFTEST FAIL: good fixture flagged", good);
    process.exit(1);
  }

  // Bad fixture: reproduces the ORIGINAL defect — no `_VOID_ENABLED$` branch, no explicit enrollment,
  // and a global-ON seed.
  const badService = `
export const POSTING_FLAG_KEYS: ReadonlySet<string> = new Set([
  "GL_POSTING_ENABLED",
]);

export function isPostingFlag(flagKey: string): boolean {
  return (
    POSTING_FLAG_KEYS.has(flagKey) ||
    /_GL_POSTING(_ENABLED)?$/.test(flagKey) ||
    /_POSTING_ENABLED$/.test(flagKey)
  );
}
`;
  const badMigration = (key) =>
    `INSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${key}', 'desc', true);`;
  const bad = assertIsPostingFlagVoid({
    service: badService,
    voidEnforcementMigration: badMigration("VOID_ENFORCEMENT_ENABLED"),
    woVoidMigration: badMigration("WO_VOID_ENABLED"),
  });
  if (bad.length < 4) {
    console.error("SELFTEST FAIL: bad fixture under-caught", bad);
    process.exit(1);
  }
  console.log("verify-is-posting-flag-void selftest OK");
  process.exit(0);
}

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    console.error(`verify-is-posting-flag-void FAIL — missing file: ${path.relative(ROOT, p)}`);
    process.exit(1);
  }
};

const errors = assertIsPostingFlagVoid({
  service: read(SERVICE),
  voidEnforcementMigration: read(VOID_ENFORCEMENT_MIGRATION),
  woVoidMigration: read(WO_VOID_MIGRATION),
});

if (errors.length) {
  console.error("verify-is-posting-flag-void FAIL — 0091-H3-3 *_VOID_ENABLED posting-flag classification broken:");
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  "verify-is-posting-flag-void OK — isPostingFlag() recognizes *_VOID_ENABLED as posting-class; " +
    "VOID_ENFORCEMENT_ENABLED + WO_VOID_ENABLED enrolled + seeded default OFF."
);
