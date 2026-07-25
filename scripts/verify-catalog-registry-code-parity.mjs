#!/usr/bin/env node
// verify:catalog-registry-code-parity
//
// LST-CAT-07. The catalog-registry module maintained the set of supported codes in THREE places and kept
// them out of step:
//
//   * WRITE surface  — createCatalogRegistrySchema.code was `z.string().regex(/^[A-Z][A-Z0-9_]+$/)`, so
//                      POST /api/v1/catalogs/registry accepted ANY screaming-snake string.
//   * READ (preview) — codeParamSchema used a hand-written z.enum of 8 codes, so an unlisted code 400s.
//   * READ (stats)   — a separate hand-maintained `statsByCode` object of the same 8 codes, which returned
//                      `item_count: 0` for anything else.
//
// Effect: `POST … {code:"FOO_BAR"}` returned 201, then stats reported 0 items FOREVER — a fabricated zero
// indistinguishable from a genuinely empty catalog — while preview returned 400. Latent on prod only
// because catalogs.catalog_registry still holds exactly the 8 rows seeded by migration 0020.
//
// The fix is structural: one source of truth (CATALOG_REGISTRY_STATS_SQL) whose KEYS derive the enum, the
// create schema and the stats lookup. This guard asserts that structure, because the defect was not a wrong
// value — it was three lists with no mechanism keeping them equal, which is the same failure class as the
// cancellation-reasons canonical contradiction (LST-F17).
//
// WHAT IT PROVES, honestly: static structure only. It cannot POST to the endpoint. The behavioural proof
// (create an unsupported code -> 400 instead of 201) is an authenticated live check and is recorded in the
// PR as such.
//
// FAILS on the pre-fix tree (permissive regex + hand-written enum + separate stats map) and PASSES on the
// fix. `--selftest` mutates REAL source, one case per assertion, and asserts the corrected shape is clean.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:catalog-registry-code-parity";
const SELFTEST = process.argv.includes("--selftest");

const ROUTES = "apps/backend/src/catalogs/catalog-registry.routes.ts";
const FILES = [ROUTES];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertCatalogRegistryCodeParity(sources) {
  const raw = sources?.[ROUTES] ?? readDisk(ROUTES);
  const src = stripComments(raw);
  const errs = [];

  // ── 1. the write surface must reuse the shared code schema, never a permissive pattern ────────────
  const createBlock = src.match(/const createCatalogRegistrySchema = z\.object\(\{[\s\S]*?\n\}\);/);
  if (!createBlock) {
    errs.push(`${ROUTES}: could not locate createCatalogRegistrySchema`);
  } else {
    const codeLine = createBlock[0].match(/^\s*code:\s*(.+)$/m);
    if (!codeLine) {
      errs.push(`${ROUTES}: createCatalogRegistrySchema has no \`code\` field`);
    } else if (/regex\(/.test(codeLine[1]) || /z\.string\(\)/.test(codeLine[1])) {
      errs.push(
        `${ROUTES}: createCatalogRegistrySchema.code accepts a free-form string (${codeLine[1].trim()}) — the write surface must reuse catalogCodeSchema, or a code can be created that stats and preview cannot serve (LST-CAT-07)`,
      );
    } else if (!/catalogCodeSchema/.test(codeLine[1])) {
      errs.push(`${ROUTES}: createCatalogRegistrySchema.code must be catalogCodeSchema, got ${codeLine[1].trim()}`);
    }
  }

  // ── 2. the enum must be DERIVED from the stats map, not a second hand-written list ────────────────
  if (!/const CATALOG_REGISTRY_STATS_SQL = \{/.test(src)) {
    errs.push(`${ROUTES}: missing CATALOG_REGISTRY_STATS_SQL — the single source of truth for supported codes`);
  }
  const enumDecl = src.match(/const catalogCodeSchema = z\.enum\((.+?)\)/s);
  if (!enumDecl) {
    errs.push(`${ROUTES}: missing catalogCodeSchema`);
  } else if (/\[\s*["']/.test(enumDecl[1])) {
    errs.push(
      `${ROUTES}: catalogCodeSchema is a hand-written literal list — it must derive from CATALOG_REGISTRY_STATS_SQL's keys, or the two lists drift apart again (that drift IS LST-CAT-07)`,
    );
  }
  if (!/Object\.keys\(CATALOG_REGISTRY_STATS_SQL\)/.test(src)) {
    errs.push(`${ROUTES}: the supported-code list must be Object.keys(CATALOG_REGISTRY_STATS_SQL)`);
  }

  // ── 3. stats must not fabricate a zero for an unsupported code ───────────────────────────────────
  const statsFn = src.match(/async function fetchCatalogStats[\s\S]*?\n\}/);
  if (!statsFn) {
    errs.push(`${ROUTES}: could not locate fetchCatalogStats`);
  } else {
    if (/statsByCode/.test(statsFn[0])) {
      errs.push(`${ROUTES}: fetchCatalogStats still has its own statsByCode map — it must read CATALOG_REGISTRY_STATS_SQL`);
    }
    if (!/stats_supported/.test(statsFn[0])) {
      errs.push(
        `${ROUTES}: fetchCatalogStats must report stats_supported — returning a bare item_count:0 for an unsupported code presents a fabricated number as data`,
      );
    }
  }

  return errs;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((r) => [r, readDisk(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert — the mutation did not change the source`);
      return;
    }
    const problems = assertCatalogRegistryCodeParity(mutated);
    if (!problems.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // Each case restores one piece of the ACTUAL pre-fix shape.
  expectCaught(
    "write-surface-back-to-permissive-regex",
    {
      ...live,
      [ROUTES]: live[ROUTES].replace(
        /(const createCatalogRegistrySchema = z\.object\(\{\n(?:.*\n)*?)(\s*)code: catalogCodeSchema,/,
        "$1$2code: z.string().trim().regex(/^[A-Z][A-Z0-9_]+$/).min(2).max(80),",
      ),
    },
    "accepts a free-form string",
  );
  expectCaught(
    "enum-back-to-hand-written-list",
    {
      ...live,
      [ROUTES]: live[ROUTES].replace(
        "const catalogCodeSchema = z.enum(CATALOG_REGISTRY_CODES);",
        'const catalogCodeSchema = z.enum(["EQUIPMENT_TYPES", "DRIVER_LOAD_STATUSES"]);',
      ),
    },
    "hand-written literal list",
  );
  expectCaught(
    "single-source-map-removed",
    { ...live, [ROUTES]: live[ROUTES].replace("const CATALOG_REGISTRY_STATS_SQL = {", "const OTHER_THING = {") },
    "missing CATALOG_REGISTRY_STATS_SQL",
  );
  expectCaught(
    "stats-fabricates-zero-again",
    { ...live, [ROUTES]: live[ROUTES].replace(/stats_supported: false/g, "fabricated: 0").replace(/stats_supported: true/g, "fabricated: 1") },
    "must report stats_supported",
  );

  const liveProblems = assertCatalogRegistryCodeParity(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCatalogRegistryCodeParity();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — one supported-code set (CATALOG_REGISTRY_STATS_SQL) derives the enum, the create schema and the stats lookup; unsupported codes cannot be created and stats never fabricate a zero.`,
);
