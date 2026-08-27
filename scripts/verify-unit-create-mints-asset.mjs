#!/usr/bin/env node
/**
 * GUARD: every writer that creates a unit must also mint its canonical `mdata.assets` row.
 *
 * FAIL-INS-POLICY-ASSET-404 (prod, br-fancy-credit-akjnd07a):
 *   mdata.assets = 43 rows TOTAL · 0 for USMCA · unit_id NULL on ALL 43
 *   mdata.units (USMCA) = 40
 * `insurance.policy_unit.asset_id` and `insurance.claim` reference `mdata.assets`, and the wizard
 * resolver (`resolve-asset-id.shared.ts`) maps unit -> asset via `a.id | a.unit_id | a.unit_code`,
 * all under `a.tenant_id`. With no asset row, every branch is dead and
 * POST /insurance/policies/with-bills 404s `asset_not_found` for EVERY unit — the units and assets
 * registries were joined by nothing but a `unit_code` string.
 *
 * The tempting "fixes" this guard exists to make unnecessary are both damaging: inventing an asset
 * inside the insurance path, or widening `a.tenant_id` so one company resolves ANOTHER company's
 * asset. The correct fix is that a unit is never created without its asset — which is what this
 * asserts, so the class cannot silently return through a new creator.
 *
 * IN SCOPE: a file that INSERTs into `mdata.units`.
 * ASSERTS:  that same file also INSERTs into `mdata.assets`.
 *
 * Run:  node scripts/verify-unit-create-mints-asset.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "apps/backend/src");
const LABEL = "verify-unit-create-mints-asset";

/**
 * KNOWN GAPS — creators that write units without minting an asset, each with the reason it is not
 * simply fixed. The list may only SHRINK; adding to it is a visible, reviewable edit.
 */
const KNOWN_GAPS = new Map([
  [
    "apps/backend/src/seed/csv-seed-import.ts",
    "Bulk CSV importer. Imported rows are exempt under the row-origin ruling — a seed file is not an operator surface.",
  ],
  [
    "apps/backend/src/integrations/qbo/qbo-vendor-linkage.service.ts",
    "QBO mirror projection: rows are clones of QBO records, and minting assets from a mirror would fabricate fleet the source system does not have.",
  ],
  [
    "apps/backend/src/integrations/samsara/samsara-master-sync.service.ts",
    "Samsara master sync: telematics-derived units. Asset minting belongs to the operator create path, not to a device projection.",
  ],
  [
    "apps/backend/src/onboarding/seed-sample-data.ts",
    "Sample-data seeder; rows it writes are fixtures by construction. Found by THIS guard, not by the hand grep that scoped the work — which is the point of writing it.",
  ],
]);

const strip = (s) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

export function insertsInto(code, relation) {
  return new RegExp(
    `INSERT\\s+INTO\\s+${relation.replace(".", "\\.")}\\b`,
    "i",
  ).test(code);
}

export function collectProblems(files) {
  const problems = [];
  for (const { rel, src } of files) {
    const code = strip(src);
    if (!insertsInto(code, "mdata.units")) continue;

    const mintsAsset =
      insertsInto(code, "mdata.assets") || /\bensureUnitAsset\s*\(/.test(code);
    const listed = KNOWN_GAPS.has(rel);

    if (!mintsAsset && !listed) {
      problems.push(
        `${rel}: INSERTs into mdata.units but never INSERTs into mdata.assets. A unit with no asset row ` +
          `can never be insured — insurance.policy_unit.asset_id has nothing to point at and the wizard ` +
          `resolver returns asset_not_found (FAIL-INS-POLICY-ASSET-404). Mint the asset, or add this file ` +
          `to KNOWN_GAPS with a reason.`,
      );
    }
    if (mintsAsset && listed) {
      problems.push(
        `${rel}: now mints its asset — remove it from KNOWN_GAPS so the list cannot silently regrow.`,
      );
    }
    if (rel === "apps/backend/src/mdata/units.routes.ts" && mintsAsset) {
      const scopeAt = src.search(
        /await setScopedCompanyContext\(\s*client,\s*authUser\.uuid,\s*(?:resolvedLeasedId \?\? resolvedOwnerId|operatingCompanyId),?\s*\)/,
      );
      const assetAt = src.indexOf("await ensureUnitAsset(client, {");
      if (scopeAt < 0 || assetAt < 0 || scopeAt > assetAt) {
        problems.push(
          `${rel}: canonical unit create must validate and bind the effective operating company before ` +
            `ensureUnitAsset; mdata.assets is FORCE-RLS and otherwise rejects the live create.`,
        );
      }
    }
  }
  return problems;
}

function readTree() {
  return walk(DIR).map((f) => ({
    rel: path.relative(root, f),
    src: fs.readFileSync(f, "utf8"),
  }));
}

function selftest() {
  const mk = (rel, src) => ({ rel, src });
  const cases = [
    { name: "real tree passes", files: null, expect: 0 },
    {
      name: "unit creator without asset mint is caught",
      files: [
        mk(
          "apps/backend/src/x/foo.ts",
          "INSERT INTO mdata.units (a) VALUES ($1)",
        ),
      ],
      expectAtLeast: 1,
    },
    {
      name: "unit creator that mints passes",
      files: [
        mk(
          "apps/backend/src/x/foo.ts",
          "INSERT INTO mdata.units (a) VALUES ($1); INSERT INTO mdata.assets (b) VALUES ($2)",
        ),
      ],
      expect: 0,
    },
    {
      name: "file that touches neither is ignored",
      files: [mk("apps/backend/src/x/bar.ts", "SELECT 1")],
      expect: 0,
    },
    {
      name: "commented-out insert does not count",
      files: [
        mk(
          "apps/backend/src/x/baz.ts",
          "// INSERT INTO mdata.units (a)\nconst a = 1;",
        ),
      ],
      expect: 0,
    },
    {
      name: "stale KNOWN_GAPS entry is caught",
      files: [
        mk(
          "apps/backend/src/seed/csv-seed-import.ts",
          "INSERT INTO mdata.units (a); INSERT INTO mdata.assets (b)",
        ),
      ],
      expectAtLeast: 1,
    },
    {
      name: "real route without company context before asset mint is caught",
      files: readTree().map((file) =>
        file.rel === "apps/backend/src/mdata/units.routes.ts"
          ? {
              ...file,
              src: file.src.replace(
                /await setScopedCompanyContext\(\s*client,\s*authUser\.uuid,\s*operatingCompanyId,?\s*\);/,
                "// planted defect: missing company context",
              ),
            }
          : file,
      ),
      expectAtLeast: 1,
    },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = collectProblems(c.files ?? readTree());
    const ok =
      c.expect === 0
        ? problems.length === 0
        : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else
      console.error(
        `  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`,
      );
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(DIR)) {
    console.error(`${LABEL}: FAIL — ${DIR} not found`);
    return 1;
  }
  const problems = collectProblems(readTree());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  for (const [file, reason] of KNOWN_GAPS)
    console.log(`  KNOWN GAP (must shrink) — ${file}\n      ${reason}`);
  return 0;
}

process.exit(main());
