#!/usr/bin/env node
/**
 * SWEEP-C11 — forbid a logical entity from having TWO live writer surfaces in TWO different
 * schemas at once (split-brain).
 *
 * CONFIRMED DEFECT (owner order, 2026-07-25): /api/v1/catalogs/driver/{license-classes,
 * endorsements,restrictions,medical-card-status,employment-status} wrote catalogs.* while the
 * canonical /api/v1/lists/drivers/* surface wrote reference.* for the exact same 5 logical
 * driver sub-catalogs. Both accepted live POST/PATCH/DELETE — a row created on one was invisible
 * on the other. Documented (but left open) in
 * apps/frontend/src/components/parity/catalogPickerRegistry.ts:196-198. Neon prod lucia-bypass
 * read (2026-07-25, tiny-field-89581227 br-fancy-credit-akjnd07a): catalogs.* = 0/0/0/0/0 rows,
 * reference.* = 9/6/7/9/11 rows → reference.* is canonical, catalogs.* is the confirmed loser.
 *
 * WHAT THIS GUARD PROVES (mechanically, every CI run, no DB connection):
 *   1. The set of driver sub-catalog table names is derived LIVE from the two source-of-truth
 *      config arrays (DRIVER_SUBCATALOG_CONFIGS in catalogs/driver/subcatalog-config.ts and
 *      DRIVERS_REFERENCE_CONFIGS in lists/drivers-reference.shared.ts) — never hardcoded — so a
 *      future addition/removal to either array is picked up automatically (drift-proof).
 *   2. Every table name present in BOTH arrays (the split-brain candidate set) MUST have its
 *      catalogs.* writer registration (lists/driver-catalogs.routes.ts) carry a literal
 *      `writesBlocked: true` in the `deprecation` config passed to createCatalogRoutes — the flag
 *      that makes apps/backend/src/catalogs/driver/factory.ts return 410 on POST/PATCH/DELETE
 *      instead of writing catalogs.${tableName} (see factory.ts sendSplitBrainWritesBlocked).
 *   3. The required-seed check (REQUIRED_SPLIT_BRAIN_SEEDS) fails loud if the intersection ever
 *      goes empty for a reason OTHER than the fix (e.g. someone deletes an array) — a guard that
 *      can silently stop testing is the exact "can't-fail" shape this repo is removing.
 *
 * `--selftest` plants TWO synthetic writer registrations for the same logical table name — one
 * "clean" (writesBlocked: true, passes) and one "bad" (missing the flag, fails) — proving the
 * guard fails on the bug and passes on the fix, independent of the real repo's current state.
 *
 * BASELINE (shrink-only ratchet): scripts/verify-sweep-c11-no-entity-split-brain.baseline.json
 * records the open split-brain entity keys at the time this guard was written. This PR fixes the
 * only confirmed instance in the same commit, so the baseline ships at `keys: []` (zero open) —
 * it exists so any FUTURE split-brain pair is a hard CI failure from day one, and so a reviewer
 * can see at a glance that this is a zero-tolerance guard, not a "some day" tracker. The baseline
 * may only shrink (impossible once at zero) or stay at zero; `--strict` ignores it entirely and
 * always fails on any open pair (the two modes are equivalent once the baseline is empty).
 *
 * Rule 17: wired ONLY via scripts/verify-steps/1540-*.mjs.
 *
 * Usage:
 *   node scripts/verify-sweep-c11-no-entity-split-brain.mjs --selftest
 *   node scripts/verify-sweep-c11-no-entity-split-brain.mjs
 *   node scripts/verify-sweep-c11-no-entity-split-brain.mjs --strict
 *   UPDATE_C11_SPLIT_BRAIN_BASELINE=1 node scripts/verify-sweep-c11-no-entity-split-brain.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-sweep-c11-no-entity-split-brain";
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");

const CATALOG_CONFIG_FILE = path.join(BACKEND_SRC, "catalogs", "driver", "subcatalog-config.ts");
const REFERENCE_CONFIG_FILE = path.join(BACKEND_SRC, "lists", "drivers-reference.shared.ts");
const CATALOG_REGISTRATION_FILE = path.join(BACKEND_SRC, "lists", "driver-catalogs.routes.ts");
const BASELINE_FILE = path.join(ROOT, "scripts", "verify-sweep-c11-no-entity-split-brain.baseline.json");

/** Names that MUST still be found as split-brain candidates today (guard-teeth: can't go vacuous). */
const REQUIRED_SPLIT_BRAIN_SEEDS = [
  "license_classes",
  "cdl_endorsements",
  "cdl_restrictions",
  "medical_card_statuses",
  "employment_statuses",
];

/**
 * Extract every `tableName: "xxx"` literal from an exported const array/object-array declaration.
 * Deliberately whole-file (not scoped to one `export const NAME = [...]` block) — the intent is
 * "every table name this config file declares", and these config files declare exactly one array
 * each, so scanning the whole file is equivalent and more robust to formatting drift.
 * @param {string} source
 * @returns {string[]}
 */
export function extractTableNames(source) {
  const names = [];
  const re = /tableName:\s*"([a-z_]+)"/g;
  let m;
  while ((m = re.exec(source)) !== null) names.push(m[1]);
  return [...new Set(names)];
}

/**
 * Does the registration source pass `writesBlocked: true` inside a `deprecation: { ... }` block
 * to createCatalogRoutes? Static regex — proportionate to the actual shape of this file (ONE
 * loop, ONE literal deprecation object applied to every config in the array).
 * @param {string} source
 * @returns {boolean}
 */
export function registrationBlocksWrites(source) {
  const deprecationBlock = /deprecation:\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = deprecationBlock.exec(source)) !== null) {
    if (/writesBlocked:\s*true\b/.test(m[1])) return true;
  }
  return false;
}

/**
 * Pure check against in-memory file contents so --selftest can exercise synthetic fixtures
 * without touching disk, and so the real run reads the real repo.
 * @param {{catalogConfigSrc: string, referenceConfigSrc: string, registrationSrc: string}} files
 * @returns {{intersection: string[], blocked: boolean, problems: string[]}}
 */
export function checkSplitBrain({ catalogConfigSrc, referenceConfigSrc, registrationSrc }) {
  const catalogNames = extractTableNames(catalogConfigSrc);
  const referenceNames = new Set(extractTableNames(referenceConfigSrc));
  const intersection = catalogNames.filter((n) => referenceNames.has(n)).sort();
  const blocked = intersection.length === 0 ? true : registrationBlocksWrites(registrationSrc);

  // One key per open (unblocked) split-brain table — this is what the shrink-only baseline
  // tracks. All of them share one `blocked` bit today because driver-catalogs.routes.ts applies
  // ONE literal deprecation object to every entry in the loop; per-table keys still let a future
  // per-entity registration shape (or a second module hitting this same guard class) shrink one
  // table at a time instead of all-or-nothing.
  const openKeys = blocked ? [] : intersection.map((t) => `catalogs.${t}<->reference.${t}`);

  const problems = [];
  if (openKeys.length > 0) {
    problems.push(
      `SPLIT-BRAIN: table name(s) [${intersection.join(", ")}] exist in BOTH the catalogs.* driver ` +
        `sub-catalog config (subcatalog-config.ts) AND the reference.* drivers config ` +
        `(drivers-reference.shared.ts), but the catalogs.* writer registration ` +
        `(driver-catalogs.routes.ts) does not set deprecation.writesBlocked:true. Both schemas can ` +
        `accept live writes for the same logical entity — a row created on one is invisible on the ` +
        `other. Set writesBlocked:true (factory.ts already implements the 410) or repoint the writer.`
    );
  }
  return { intersection, blocked, problems, openKeys };
}

function loadRealFiles() {
  return {
    catalogConfigSrc: fs.readFileSync(CATALOG_CONFIG_FILE, "utf8"),
    referenceConfigSrc: fs.readFileSync(REFERENCE_CONFIG_FILE, "utf8"),
    registrationSrc: fs.readFileSync(CATALOG_REGISTRATION_FILE, "utf8"),
  };
}

function selftest() {
  const failures = [];

  // Arm 1 — BAD: two configs declare the same table name in both schemas, catalogs-side writer
  // does NOT block writes. Must be caught.
  {
    const bad = checkSplitBrain({
      catalogConfigSrc: `export const DRIVER_SUBCATALOG_CONFIGS = [\n  { tableName: "widget_types", urlSegment: "widget-types" },\n];`,
      referenceConfigSrc: `export const DRIVERS_REFERENCE_CONFIGS = [\n  { tableName: "widget_types", urlSegment: "widget-types" },\n];`,
      registrationSrc: `createCatalogRoutes(app, { tableName: config.tableName, deprecation: { navSegment: "x", successorListsSegment: "y" } });`,
    });
    if (bad.intersection.join(",") !== "widget_types") {
      failures.push(`selftest arm1: expected intersection [widget_types], got [${bad.intersection.join(",")}]`);
    }
    if (bad.blocked !== false || bad.problems.length !== 1) {
      failures.push("selftest arm1: planted split-brain (no writesBlocked) was NOT caught");
    }
  }

  // Arm 2 — GOOD: same duplicate-name shape, but the registration DOES carry writesBlocked:true.
  // Must pass clean.
  {
    const good = checkSplitBrain({
      catalogConfigSrc: `export const DRIVER_SUBCATALOG_CONFIGS = [\n  { tableName: "widget_types", urlSegment: "widget-types" },\n];`,
      referenceConfigSrc: `export const DRIVERS_REFERENCE_CONFIGS = [\n  { tableName: "widget_types", urlSegment: "widget-types" },\n];`,
      registrationSrc: `createCatalogRoutes(app, { tableName: config.tableName, deprecation: { navSegment: "x", successorListsSegment: "y", writesBlocked: true } });`,
    });
    if (good.blocked !== true || good.problems.length !== 0) {
      failures.push("selftest arm2: writesBlocked:true fix was NOT recognized as clean");
    }
  }

  // Arm 3 — no overlap at all (disjoint table names): trivially clean, no false positive.
  {
    const disjoint = checkSplitBrain({
      catalogConfigSrc: `export const DRIVER_SUBCATALOG_CONFIGS = [\n  { tableName: "pay_rate_templates", urlSegment: "pay-rate-templates" },\n];`,
      referenceConfigSrc: `export const DRIVERS_REFERENCE_CONFIGS = [\n  { tableName: "license_classes", urlSegment: "license-classes" },\n];`,
      registrationSrc: `createCatalogRoutes(app, { tableName: config.tableName });`,
    });
    if (disjoint.intersection.length !== 0 || disjoint.problems.length !== 0) {
      failures.push("selftest arm3: disjoint table names produced a false-positive split-brain");
    }
  }

  // Arm 4 — the REAL repo files must currently be clean (this is the actual fix under test).
  {
    const real = checkSplitBrain(loadRealFiles());
    const missingSeeds = REQUIRED_SPLIT_BRAIN_SEEDS.filter((s) => !real.intersection.includes(s));
    if (missingSeeds.length) {
      failures.push(
        `selftest arm4: required split-brain seed(s) missing from the live intersection — ${missingSeeds.join(", ")}. ` +
          "Either DRIVER_SUBCATALOG_CONFIGS or DRIVERS_REFERENCE_CONFIGS lost an entry (guard would go vacuous)."
      );
    }
    if (!real.blocked || real.problems.length !== 0) {
      failures.push(`selftest arm4: REAL repo has an OPEN split-brain — ${real.problems.join(" | ")}`);
    }
  }

  if (failures.length) {
    console.error(`[${LABEL}] SELFTEST FAIL:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS (4 arms: catch-bad, accept-fix, no-false-positive, real-repo-clean)`);
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
    return new Set(Array.isArray(data.keys) ? data.keys : []);
  } catch {
    return null;
  }
}

function writeBaseline(openKeys) {
  const keys = [...new Set(openKeys)].sort();
  fs.writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        _comment:
          "SWEEP-C11 shrink-only baseline — open (unblocked) entity split-brain pairs. Regenerate: " +
          "UPDATE_C11_SPLIT_BRAIN_BASELINE=1. Ships at keys:[] because this PR fixes the only " +
          "confirmed pair in the same commit — any NEW key is an immediate CI failure, never a " +
          "silently-tolerated debt item. The list may only shrink (impossible below zero).",
        generated_at: new Date().toISOString(),
        count: keys.length,
        keys,
      },
      null,
      2
    ) + "\n"
  );
  return keys;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    selftest();
    return;
  }

  for (const f of [CATALOG_CONFIG_FILE, REFERENCE_CONFIG_FILE, CATALOG_REGISTRATION_FILE]) {
    if (!fs.existsSync(f)) {
      console.error(`[${LABEL}] FAIL — expected source file not found: ${path.relative(ROOT, f)}`);
      process.exit(1);
    }
  }

  const result = checkSplitBrain(loadRealFiles());
  const missingSeeds = REQUIRED_SPLIT_BRAIN_SEEDS.filter((s) => !result.intersection.includes(s));
  if (missingSeeds.length) {
    console.error(
      `[${LABEL}] FAIL — required split-brain seed(s) missing from the live catalogs∩reference ` +
        `intersection: ${missingSeeds.join(", ")}. This guard proves NOTHING if the known driver ` +
        `sub-catalog pair disappears from both config arrays without a deliberate, reviewed edit ` +
        `to this guard's REQUIRED_SPLIT_BRAIN_SEEDS.`
    );
    process.exit(1);
  }

  if (process.env.UPDATE_C11_SPLIT_BRAIN_BASELINE === "1") {
    const keys = writeBaseline(result.openKeys);
    console.log(`[${LABEL}] baseline written: ${keys.length} open split-brain pair(s).`);
    process.exit(0);
  }

  const strict = args.includes("--strict");
  const baseline = loadBaseline();
  if (!strict && !baseline) {
    console.error(
      `[${LABEL}] FAIL — baseline missing (${path.relative(ROOT, BASELINE_FILE)}). ` +
        `Run: UPDATE_C11_SPLIT_BRAIN_BASELINE=1 node scripts/verify-sweep-c11-no-entity-split-brain.mjs`
    );
    process.exit(1);
  }

  // Shrink-only: any open key NOT already in the (empty-by-design) baseline fails. Because the
  // baseline ships at keys:[], this is equivalent to --strict today — that equivalence IS the
  // zero-tolerance guarantee, not an accident.
  const newKeys = strict ? result.openKeys : result.openKeys.filter((k) => !baseline.has(k));
  const knownKeys = strict ? [] : result.openKeys.filter((k) => baseline.has(k));

  if (newKeys.length) {
    console.error(`[${LABEL}] FAIL — ${newKeys.length} ${strict ? "" : "NEW "}split-brain pair(s):`);
    for (const p of result.problems) console.error(`  ✗ ${p}`);
    console.error(`\nKeys: ${newKeys.join(", ")}`);
    console.error(
      "Fix: set deprecation.writesBlocked:true on the catalogs.* writer registration (factory.ts " +
        "already implements the 410), or repoint the writer onto the canonical schema."
    );
    process.exit(1);
  }

  console.log(
    `[${LABEL}] OK — ${result.intersection.length} driver sub-catalog table(s) exist in both ` +
      `catalogs.* and reference.* configs [${result.intersection.join(", ")}]; catalogs.* writer ` +
      `registration confirms writesBlocked:true for all of them (410 on POST/PATCH/DELETE). ` +
      `Zero open split-brain pairs` +
      (knownKeys.length ? ` (${knownKeys.length} baselined key(s) — should never happen at count 0).` : ".")
  );
}

main();
