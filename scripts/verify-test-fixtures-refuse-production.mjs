#!/usr/bin/env node
/**
 * verify-test-fixtures-refuse-production — ROUND 390.1, CC-1.
 *
 * Measured 2026-10-03 (prod, USMCA, direct): apps/backend/test-helpers/db-fixture.ts ensureSecondEntityLoad() ->
 * seedLoadForCompany() wrote "E2E Customer 2E-95603e75" + load "E2E-2E-95603e75" (2026-09-30 04:07Z) and
 * "E2E Customer 2E-06daf76e" / "E2E Customer 2E-edd081e8" (2026-10-02 14:58Z) into real USMCA, all is_sample_data=false,
 * and granted the integration Owner user USMCA access — an integration suite had been run against production and no
 * fixture looked at where it was connected. The writer now refuses production; this guard keeps it that way.
 *
 * STATIC:
 *   RULE 1 — test-helpers/refuse-production.ts carries the SAME production endpoint marker and branch id as
 *            scripts/lib/prod-target-guard.mjs and scripts/lib/assert-not-production.mjs (one truth, mirrored).
 *   RULE 2 — every `await client.connect()` in test-helpers/db-fixture.ts and isolated-company.ts is followed by
 *            refuseProductionDatabase, and every fixture writer that receives a client checks it.
 *   RULE 3 — every DB / integration test that opens its own client either goes through a fixture helper (which refuses)
 *            or calls refuseProductionDatabase itself.
 * --selftest exercises every rule.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-test-fixtures-refuse-production";
const H = "apps/backend/test-helpers/";
const FIXTURE_HELPERS = /ensureIntegrationPrerequisites|createIsolatedOperatingCompany|ensureIntegrationLoadId|ensureSecondEntityLoad|getIntegrationWorkOrderSeedIds|refuseProductionDatabase|refuseProductionConnectionString/;
const OPENS_CLIENT = /new pg\.Client|new Client\(|new pg\.Pool/;

export function constantsProblems(refuseSrc, prodTargetSrc, assertNotProdSrc) {
  const out = [];
  const marker = refuseSrc.match(/PRODUCTION_ENDPOINT_MARKER\s*=\s*"([^"]+)"/)?.[1];
  const branch = refuseSrc.match(/PRODUCTION_BRANCH_ID\s*=\s*"([^"]+)"/)?.[1];
  const libMarker = prodTargetSrc.match(/DEFAULT_PROD_HOST_MARKERS\s*=\s*"([^"]+)"/)?.[1];
  const libBranch = assertNotProdSrc.match(/KNOWN_PRODUCTION_BRANCH_ID\s*=\s*"([^"]+)"/)?.[1];
  if (!marker || !libMarker || !libMarker.split(",").map((s) => s.trim()).includes(marker)) out.push(`RULE 1 production endpoint marker "${marker}" is not the shared DEFAULT_PROD_HOST_MARKERS "${libMarker}"`);
  if (!branch || branch !== libBranch) out.push(`RULE 1 production branch id "${branch}" is not the shared KNOWN_PRODUCTION_BRANCH_ID "${libBranch}"`);
  return out;
}

export function fixtureProblems(rel, src) {
  const out = [];
  const lines = src.split("\n");
  lines.forEach((l, i) => {
    if (/await\s+client\.connect\(\)/.test(l)) {
      const next = lines.slice(i + 1, i + 4).join("\n");
      if (!/refuseProductionDatabase\(client\)/.test(next)) out.push(`RULE 2 ${rel}:${i + 1} connects without refuseProductionDatabase right after`);
    }
  });
  for (const fn of ["seedDispatchFlagColorsForCompany", "seedLoadForCompany", "prepareCompanyForLoadInserts"]) {
    const m = src.match(new RegExp(`function ${fn}\\(client[^)]*\\)[^{]*\\{\\n([\\s\\S]{0,200})`));
    if (m && !/refuseProductionDatabase\(client\)/.test(m[1])) out.push(`RULE 2 ${rel} ${fn} writes on a caller's client without checking it is not production`);
  }
  return out;
}

export function testFileProblems(rel, src) {
  if (!OPENS_CLIENT.test(src)) return [];
  return FIXTURE_HELPERS.test(src) ? [] : [`RULE 3 ${rel} opens its own database client without a fixture helper or refuseProductionDatabase`];
}

function walk(dir, acc = []) {
  let names = [];
  try { names = readdirSync(dir); } catch { return acc; }
  for (const n of names) {
    if (n === "node_modules" || n === "dist") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(db|integration)\.test\.ts$/.test(n) || (/^tests[\\/]/.test(relative(ROOT, p)) && /\.test\.ts$/.test(n))) acc.push(p);
  }
  return acc;
}

export function run() {
  const read = (p) => readFileSync(join(ROOT, p), "utf8");
  const out = [...constantsProblems(read(H + "refuse-production.ts"), read("scripts/lib/prod-target-guard.mjs"), read("scripts/lib/assert-not-production.mjs"))];
  for (const f of [H + "db-fixture.ts", H + "isolated-company.ts"]) out.push(...fixtureProblems(f, read(f)));
  for (const abs of [...walk(join(ROOT, "apps/backend/src")), ...walk(join(ROOT, "tests"))]) {
    const rel = relative(ROOT, abs);
    out.push(...testFileProblems(rel, readFileSync(abs, "utf8")));
  }
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const ref = 'export const PRODUCTION_ENDPOINT_MARKER = "ep-x";\nexport const PRODUCTION_BRANCH_ID = "br-y";';
    const cases = [
      ["constants equal the shared ones", constantsProblems(ref, 'const DEFAULT_PROD_HOST_MARKERS = "ep-x";', 'export const KNOWN_PRODUCTION_BRANCH_ID = "br-y";').length === 0],
      ["a drifted branch id fails", constantsProblems(ref, 'const DEFAULT_PROD_HOST_MARKERS = "ep-x";', 'export const KNOWN_PRODUCTION_BRANCH_ID = "br-z";').some((x) => x.startsWith("RULE 1"))],
      ["a fixture connect with the refusal passes", fixtureProblems("f.ts", "  await client.connect();\n  await refuseProductionDatabase(client).catch(() => {});\n").length === 0],
      ["a fixture connect without the refusal fails", fixtureProblems("f.ts", "  await client.connect();\n  await client.query('x');\n").some((x) => x.startsWith("RULE 2"))],
      ["seedLoadForCompany without a check fails", fixtureProblems("f.ts", "async function seedLoadForCompany(client: pg.Client, c: string, s: string): Promise<string> {\n  await client.query('INSERT');\n").some((x) => x.includes("seedLoadForCompany"))],
      ["a test using a fixture helper passes", testFileProblems("a.db.test.ts", "const db = new pg.Client(x); await ensureIntegrationPrerequisites();").length === 0],
      ["a test opening a bare client fails", testFileProblems("a.db.test.ts", "const db = new pg.Client(x); await db.connect(); await db.query('INSERT');").some((x) => x.startsWith("RULE 3"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — fixtures and self-connecting DB tests refuse production (endpoint marker + Neon branch), constants equal the shared ones.`);
}
