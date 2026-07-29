#!/usr/bin/env node
/**
 * FUEL-F01 — Fuel KPI money figures must render with thousands-grouping.
 *
 * ROOT CAUSE the guard exists to catch: FuelKpiRow.tsx used to format MTD Spend / Avg $/gal /
 * MTD Savings with a local `fixed()` helper built on bare `toFixed()`. `toFixed()` only controls
 * decimal precision — it has NO thousands-grouping — so a $54,409 MTD spend rendered as `$54409`,
 * genuinely hard to read at a glance and inconsistent with every other money figure in the product
 * ("$4,718" on Home, "-$168,722.50" on Cash Flow, "$54,409" via `toLocaleString`/`Intl.NumberFormat`
 * elsewhere in the fuel module — see FuelTransactionsTable.tsx / RelayDepositReview.tsx).
 *
 * FIX shipped alongside this guard: the shared `fixed()` helper in FuelKpiRow.tsx switched to
 * `n.toLocaleString("en-US", { minimumFractionDigits, maximumFractionDigits })`, which applies
 * grouping while preserving the requested precision.
 *
 * WHAT THIS GUARD ASSERTS (statically, on the frontend source — no live browser check):
 *   1. Each of the three money-labelled fuel KPIs (MTD Spend, Avg $/gal, MTD Savings) is rendered
 *      through a "$"-prefixed formatter call, not an inline template literal.
 *   2. All three money KPIs route through the SAME formatter function — one shared helper, not
 *      three copies that can drift independently.
 *   3. That formatter's definition (resolved locally, or through one level of import if the
 *      helper lives in a shared lib) uses a GROUPING-CAPABLE API — `toLocaleString` or
 *      `Intl.NumberFormat` — not `toFixed()` alone. A formatter using only `toFixed()` is exactly
 *      the regression this guard exists to block.
 *
 * Does NOT verify live rendered output (browser/prod) — that remains a separate, human/E2E check.
 * Does NOT invent a system-wide "money vs count" classifier (the PR's own GUARD note flagged that
 * as a 105-hit false-positive risk) — this guard is scoped to the three named fuel money KPIs only.
 *
 *   node scripts/verify-fuel-kpi-money-format.mjs
 *   node scripts/verify-fuel-kpi-money-format.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-kpi-money-format";
const KPI_FILE = "apps/frontend/src/pages/fuel/components/FuelKpiRow.tsx";

/** The three money-labelled KPIs on the fuel strip that must render grouped. */
const MONEY_KPIS = [
  { label: "MTD Spend", metricKey: "mtd_spend" },
  { label: "Avg $/gal", metricKey: "avg_price_per_gallon" },
  { label: "MTD Savings", metricKey: "mtd_savings" },
];

const GROUPING_API_RE = /\btoLocaleString\s*\(|\bIntl\s*\.\s*NumberFormat\s*\(/;

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Find the formatter call site for one money KPI, e.g.
 *   fixed(metric(dashboard?.mtd_spend), 0, "$")
 * Returns the captured formatter identifier, or null if the KPI isn't wired through a
 * `$`-prefixed formatter call at all (inline template literal / no prefix / etc).
 */
function findFormatterName(content, metricKey) {
  const re = new RegExp(
    `(\\w+)\\(\\s*metric\\(\\s*dashboard\\?\\.\\s*${metricKey}\\s*\\)\\s*,\\s*\\d+\\s*,\\s*"\\$"`,
    "s"
  );
  const m = re.exec(content);
  return m ? m[1] : null;
}

/**
 * Locate a formatter's own definition inside `content` (const arrow fn or function declaration).
 * Returns a bounded slice of source starting at the definition, or null if not defined locally.
 */
function localDefinitionSlice(content, name) {
  const patterns = [
    new RegExp(`const\\s+${name}\\s*=`, "s"),
    new RegExp(`function\\s+${name}\\s*\\(`, "s"),
  ];
  for (const re of patterns) {
    const m = re.exec(content);
    if (m) return content.slice(m.index, m.index + 600);
  }
  return null;
}

/**
 * Resolve `import { name } from "./relPath"` (or default import) to a file under ROOT, if present.
 * `exists(candidateRelPath)` is injectable so the selftest can exercise import resolution without
 * touching the real filesystem.
 */
function importedFilePath(content, name, fromFile, exists = (rel) => fs.existsSync(path.join(ROOT, rel))) {
  const named = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`);
  const def = new RegExp(`import\\s+${name}\\s+from\\s*["']([^"']+)["']`);
  const m = named.exec(content) || def.exec(content);
  if (!m) return null;
  const importPath = m[1];
  if (!importPath.startsWith(".")) return null; // only resolve relative/local imports
  const base = path.dirname(path.join(ROOT, fromFile));
  const resolved = path.relative(ROOT, path.resolve(base, importPath));
  for (const candidate of [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`]) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

/**
 * `readFile(rel)` is injectable so the selftest can exercise import-resolution and definition
 * lookup against synthetic in-memory fixtures instead of real files on disk.
 */
export function contractErrors(
  kpiContent,
  { readFile = readReal, kpiPath = KPI_FILE, importExists = undefined } = {}
) {
  const errors = [];

  const names = new Map();
  for (const { label, metricKey } of MONEY_KPIS) {
    const name = findFormatterName(kpiContent, metricKey);
    if (!name) {
      errors.push(
        `${label} is not rendered through a "$"-prefixed formatter call (fixed(metric(dashboard?.${metricKey}), digits, "$")) — ` +
          `an inline template literal or unprefixed value can silently drop thousands-grouping.`
      );
      continue;
    }
    names.set(label, name);
  }

  const distinctFormatters = new Set(names.values());
  if (distinctFormatters.size > 1) {
    errors.push(
      `Money KPIs use DIFFERENT formatter functions (${[...names.entries()]
        .map(([l, n]) => `${l}=${n}`)
        .join(", ")}) — one shared helper is required so grouping can't drift independently.`
    );
  }

  for (const formatterName of distinctFormatters) {
    let slice = localDefinitionSlice(kpiContent, formatterName);
    let sourceDescription = kpiPath;

    if (!slice) {
      const importedRel = importExists
        ? importedFilePath(kpiContent, formatterName, kpiPath, importExists)
        : importedFilePath(kpiContent, formatterName, kpiPath);
      if (!importedRel) {
        errors.push(
          `Formatter "${formatterName}" is neither defined locally in ${kpiPath} nor resolvable via a relative import — cannot verify it groups.`
        );
        continue;
      }
      const importedContent = readFile(importedRel);
      slice = localDefinitionSlice(importedContent, formatterName);
      sourceDescription = importedRel;
      if (!slice) {
        errors.push(`Formatter "${formatterName}" imported from ${importedRel} has no local definition there.`);
        continue;
      }
    }

    if (!GROUPING_API_RE.test(slice)) {
      errors.push(
        `Formatter "${formatterName}" (${sourceDescription}) does not use toLocaleString(...)/Intl.NumberFormat(...) — ` +
          `a grouping-capable API is required. bare toFixed() alone reproduces the "$54409" regression.`
      );
    }
  }

  return errors;
}

function selftest() {
  const good = `
const fixed = (n, digits, prefix = "", suffix = "") =>
  n === null
    ? null
    : \`\${prefix}\${n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}\${suffix}\`;

<DrillKpiCard label="MTD Spend" value={fixed(metric(dashboard?.mtd_spend), 0, "$")} to="/fuel/history" />
<DrillKpiCard label="Avg $/gal" value={fixed(metric(dashboard?.avg_price_per_gallon), 2, "$")} to="/fuel/history" />
<DrillKpiCard label="MTD Savings" value={fixed(metric(dashboard?.mtd_savings), 0, "$")} to="/fuel/planner" />
`;
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  console.log("  ok: current toLocaleString-grouped formatter passes clean");

  const toFixedOnlyRegression = good.replace(
    /n\.toLocaleString\("en-US", \{\s*minimumFractionDigits: digits,\s*maximumFractionDigits: digits,\s*\}\)/,
    "n.toFixed(digits)"
  );
  const toFixedErrors = contractErrors(toFixedOnlyRegression);
  if (!toFixedErrors.some((e) => e.includes("toLocaleString"))) {
    console.error(`${LABEL} --selftest FAIL: toFixed()-only regression not caught:`, toFixedErrors);
    process.exit(1);
  }
  console.log("  caught: the exact $54409 regression (toFixed() with no grouping API)");

  const driftedInline = good.replace(
    'value={fixed(metric(dashboard?.mtd_savings), 0, "$")}',
    'value={`$${(metric(dashboard?.mtd_savings) ?? 0).toFixed(0)}`}'
  );
  const driftErrors = contractErrors(driftedInline);
  if (!driftErrors.some((e) => e.includes("MTD Savings"))) {
    console.error(`${LABEL} --selftest FAIL: one KPI drifting to an ad-hoc inline formatter not caught:`, driftErrors);
    process.exit(1);
  }
  console.log("  caught: one KPI silently bypassing the shared formatter via an inline template literal");

  const importedGood = `
import { fixed } from "../../../lib/money-fixed";
<DrillKpiCard label="MTD Spend" value={fixed(metric(dashboard?.mtd_spend), 0, "$")} to="/fuel/history" />
<DrillKpiCard label="Avg $/gal" value={fixed(metric(dashboard?.avg_price_per_gallon), 2, "$")} to="/fuel/history" />
<DrillKpiCard label="MTD Savings" value={fixed(metric(dashboard?.mtd_savings), 0, "$")} to="/fuel/planner" />
`;
  const fakeReadGrouped = () => `export const fixed = (n, d) => n.toLocaleString("en-US", { maximumFractionDigits: d });`;
  const fakeExists = () => true;
  if (contractErrors(importedGood, { readFile: fakeReadGrouped, importExists: fakeExists }).length) {
    console.error(
      `${LABEL} --selftest FAIL: a grouped formatter imported from a shared lib was flagged:`,
      contractErrors(importedGood, { readFile: fakeReadGrouped, importExists: fakeExists })
    );
    process.exit(1);
  }
  console.log("  ok: a shared-lib import with a grouping formatter resolves and passes");

  const fakeReadUngrouped = () => `export const fixed = (n, d) => n.toFixed(d);`;
  const importedBadErrors = contractErrors(importedGood, { readFile: fakeReadUngrouped, importExists: fakeExists });
  if (!importedBadErrors.some((e) => e.includes("toLocaleString"))) {
    console.error(
      `${LABEL} --selftest FAIL: an ungrouped formatter imported from a shared lib was NOT flagged:`,
      importedBadErrors
    );
    process.exit(1);
  }
  console.log("  caught: an imported shared-lib formatter that regresses to toFixed()-only");

  console.log(`${LABEL}: selftest PASS — 5 cases (clean, toFixed regression, drifted KPI, good import, bad import)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const content = readReal(KPI_FILE);
const errors = contractErrors(content);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — MTD Spend / Avg $/gal / MTD Savings share one formatter using toLocaleString/Intl.NumberFormat grouping`
);
process.exit(0);
