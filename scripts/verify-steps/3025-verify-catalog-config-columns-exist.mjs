#!/usr/bin/env node
/**
 * LV-CATALOG-VENDOR-TYPES-500-PHANTOM-COLUMN — a catalog config named a column its table does not
 * have, so the endpoint 500'd with PG 42703 on first use (3x per vendor detail load, live on prod).
 *
 * This guard is deliberately NOT about vendor_types. Fixing one config would leave the class alive:
 * every one of the 30 GenericCatalogConfig blocks names columns in allowedColumns / requiredColumns /
 * searchableColumns / displayNameColumn / defaultSort.column / softDeleteColumn, and ANY of them can
 * name a phantom column and ship green — the failure only appears when a user opens that screen.
 *
 * So it asserts the general invariant: every column a catalog config names MUST exist on that
 * catalog's table. The contract is docs/schema-parity-baseline.json (the same baseline
 * verify-sql-column-existence trusts), so this needs no database and runs in plain CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "3025-verify-catalog-config-columns-exist";
const CONFIG_FILE = path.join(ROOT, "apps/backend/src/catalogs/generic-catalog.routes.ts");
const BASELINE_FILE = path.join(ROOT, "docs/schema-parity-baseline.json");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function loadBaselineTables() {
  const raw = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const tables = raw.tables ?? raw;
  if (!tables || typeof tables !== "object") fail(`could not read tables map from ${BASELINE_FILE}`);
  return tables;
}

/** Pull a string-array literal field (e.g. allowedColumns: ["a","b"]) out of one config block. */
function arrayField(block, field) {
  const m = block.match(new RegExp(`${field}\\s*:\\s*\\[([^\\]]*)\\]`));
  if (!m) return [];
  return [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
}

/** Pull a plain string field (e.g. tableName: "vendor_types"). */
function stringField(block, field) {
  const m = block.match(new RegExp(`${field}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
  return m ? m[1] : null;
}

/**
 * ★ `code` and `display_name` are LOGICAL names, not physical ones. generic-catalog.factory.ts:75-76
 * resolves them:
 *     display_name -> config.displayNameColumn ?? "display_name"
 *     code         -> config.codeColumn ?? "code"
 * so a catalog whose table really has `rate_name` legitimately writes allowedColumns:["display_name"]
 * and declares displayNameColumn:"rate_name".
 *
 * This function MUST mirror the factory exactly. The first version of this guard did not, and it
 * reported 7 false positives — it would have had me "fix" six correct configs and break their write
 * paths, since the logical name is the API contract clients send. Verified against the factory source,
 * not assumed. If the factory's mapping changes, this must change with it.
 */
function toPhysical(column, config) {
  if (column === "display_name") return config.displayNameColumn ?? "display_name";
  if (column === "code" && config.codeColumn) return config.codeColumn;
  return column;
}

/**
 * Split the source into one text block per exported catalog config. Each block runs from its
 * `export const xCatalogConfig` to the next one, which is enough to scope the field regexes.
 */
function parseConfigs(src) {
  const starts = [...src.matchAll(/export const (\w+CatalogConfig)\s*:\s*GenericCatalogConfig\s*=\s*\{/g)];
  return starts.map((m, i) => {
    const from = m.index;
    const to = i + 1 < starts.length ? starts[i + 1].index : src.length;
    return { name: m[1], block: src.slice(from, to) };
  });
}

/** Tables the baseline does not cover — reported loudly, never silently skipped. */
const uncovered = [];

function audit() {
  const problems = [];
  uncovered.length = 0;
  if (!fs.existsSync(CONFIG_FILE)) return [`missing ${path.relative(ROOT, CONFIG_FILE)}`];
  const src = fs.readFileSync(CONFIG_FILE, "utf8");
  const tables = loadBaselineTables();
  const configs = parseConfigs(src);

  if (configs.length === 0) {
    // A rename/refactor that makes this guard scan nothing would otherwise pass silently forever.
    return ["parsed 0 catalog configs — the parser no longer matches the source shape (guard would be inert)"];
  }

  for (const { name, block } of configs) {
    const tableName = stringField(block, "tableName");
    if (!tableName) {
      problems.push(`${name}: could not read tableName`);
      continue;
    }
    const key = `catalogs.${tableName}`;
    const columns = tables[key];
    if (!Array.isArray(columns)) {
      // NOT a defect and NOT this finding: these tables exist on prod (spot-verified
      // catalogs.accident_types and catalogs.lumper_providers against information_schema — both
      // present with the full canonical shape), they are simply absent from the schema-parity
      // baseline. Failing here would block every catalog PR on someone else's baseline-coverage gap.
      // Recorded and printed instead, so the coverage hole stays visible rather than rotting.
      uncovered.push(key);
      continue;
    }
    const known = new Set(columns);
    const aliases = {
      displayNameColumn: stringField(block, "displayNameColumn"),
      codeColumn: stringField(block, "codeColumn"),
    };

    const named = [
      ...arrayField(block, "allowedColumns").map((c) => ["allowedColumns", c]),
      ...arrayField(block, "requiredColumns").map((c) => ["requiredColumns", c]),
      ...arrayField(block, "searchableColumns").map((c) => ["searchableColumns", c]),
    ];
    for (const field of ["displayNameColumn", "codeColumn", "softDeleteColumn"]) {
      const v = stringField(block, field);
      if (v) named.push([field, v]);
    }
    const sortMatch = block.match(/defaultSort\s*:\s*\{\s*column\s*:\s*["'`]([^"'`]+)["'`]/);
    if (sortMatch) named.push(["defaultSort.column", sortMatch[1]]);

    for (const [field, col] of named) {
      // Alias fields name a PHYSICAL column directly; everything else goes through the factory's
      // logical->physical resolution first.
      const physical =
        field === "displayNameColumn" || field === "codeColumn" ? col : toPhysical(col, aliases);
      if (!known.has(physical)) {
        const via = physical === col ? "" : ` (resolves to "${physical}")`;
        problems.push(
          `${name} (${key}) ${field} names "${col}"${via} which does not exist on that table — this is the 42703 shape: it ships green and 500s the first time a user opens the screen`
        );
      }
    }
  }
  return problems;
}

/** First (table, physical column) pair the audit actually verifies — used to aim the selftest mutation. */
function firstVerifiedPair(src, tablesRef) {
  for (const { block } of parseConfigs(src)) {
    const tableName = stringField(block, "tableName");
    if (!tableName) continue;
    const key = `catalogs.${tableName}`;
    if (!Array.isArray(tablesRef[key])) continue;
    const aliases = {
      displayNameColumn: stringField(block, "displayNameColumn"),
      codeColumn: stringField(block, "codeColumn"),
    };
    for (const col of arrayField(block, "allowedColumns")) {
      const physical = toPhysical(col, aliases);
      if (tablesRef[key].includes(physical)) return { key, physical };
    }
  }
  return null;
}

function selftest() {
  const originalConfig = fs.readFileSync(CONFIG_FILE, "utf8");
  const originalBaseline = fs.readFileSync(BASELINE_FILE, "utf8");
  let planted = 0;

  const restore = () => {
    fs.writeFileSync(CONFIG_FILE, originalConfig);
    fs.writeFileSync(BASELINE_FILE, originalBaseline);
  };

  // 1. Reintroduce the exact defect this finding is about: a config naming a phantom column.
  const withPhantom = originalConfig.replace(
    /allowedColumns:\s*\[/,
    'allowedColumns: ["__phantom_column__", '
  );
  if (withPhantom === originalConfig) {
    restore();
    fail("selftest INERT: could not plant a phantom column — the guard proves nothing");
  }
  fs.writeFileSync(CONFIG_FILE, withPhantom);
  let problems = audit();
  restore();
  if (problems.length === 0) fail("selftest: expected FAIL after planting a phantom allowedColumns entry");
  planted += 1;

  // 2. A phantom displayNameColumn must fail too (a scalar field, not an array).
  const withPhantomDisplay = originalConfig.replace(
    /displayNameColumn:\s*["'`][^"'`]+["'`]/,
    'displayNameColumn: "__phantom_display__"'
  );
  if (withPhantomDisplay === originalConfig) {
    restore();
    fail("selftest INERT: could not plant a phantom displayNameColumn");
  }
  fs.writeFileSync(CONFIG_FILE, withPhantomDisplay);
  problems = audit();
  restore();
  if (problems.length === 0) fail("selftest: expected FAIL after planting a phantom displayNameColumn");
  planted += 1;

  // 3. Removing a real column from the baseline must fail — i.e. the guard reads the CONTRACT and is
  //    not quietly hardcoded to a column list of its own. The victim must be a column the audit
  //    ACTUALLY checks: an earlier version picked any catalogs.* entry containing display_name, and
  //    landed on a table no config resolves to, so the mutation changed nothing and the selftest
  //    reported a false INERT.
  const baselineObj = JSON.parse(originalBaseline);
  const tablesRef = baselineObj.tables ?? baselineObj;
  const victim = firstVerifiedPair(originalConfig, tablesRef);
  if (!victim) {
    restore();
    fail("selftest INERT: no config resolves to a baseline-covered table, nothing to mutate");
  }
  const { key: victimKey, physical: victimCol } = victim;
  tablesRef[victimKey] = tablesRef[victimKey].filter((c) => c !== victimCol);
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baselineObj, null, 2));
  problems = audit();
  restore();
  if (problems.length === 0) fail(`selftest: expected FAIL after removing display_name from ${victimKey}`);
  planted += 1;

  // 4. A parser that matches nothing must FAIL, not pass vacuously — the way this class of guard dies.
  fs.writeFileSync(CONFIG_FILE, "export const nothingHere = 1;\n");
  problems = audit();
  restore();
  if (problems.length === 0) fail("selftest: expected FAIL when 0 configs parse (inert-guard detection)");
  planted += 1;

  const clean = audit();
  if (clean.length) fail(`selftest cleanup still red: ${clean.join("; ")}`);
  console.log(`[${LABEL}] SELFTEST PASS (${planted} planted failures detected)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = audit();
  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s)`);
  }
  const count = parseConfigs(fs.readFileSync(CONFIG_FILE, "utf8")).length;
  const checked = count - uncovered.length;
  console.log(`[${LABEL}] PASS — ${checked} of ${count} catalog config(s) verified; every named column exists on its table`);
  if (uncovered.length) {
    console.log(
      `[${LABEL}] NOT VERIFIED (${uncovered.length}) — absent from docs/schema-parity-baseline.json, so this guard cannot check them: ${uncovered.join(", ")}`
    );
    console.log(
      `[${LABEL}] These tables DO exist on prod (spot-verified accident_types + lumper_providers); this is a baseline COVERAGE gap, not a phantom column. Coverage rises automatically as the baseline is refreshed.`
    );
  }
}
