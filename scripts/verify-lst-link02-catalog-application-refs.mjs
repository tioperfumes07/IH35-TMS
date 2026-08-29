#!/usr/bin/env node
/**
 * LST-LINK-02 close — FK-island catalogs must have ≥1 application-level consumer referencing
 * catalogs.<name> (code read or write). Empty seed-only catalogs documented honestly.
 *
 * Islands closed here (application reference, not necessarily inbound FK):
 *   catalogs.cargo_claim_reasons   — incidents.routes validates claim_reason_code
 *   catalogs.wo_cancellation_reasons — work-orders cancel validates cancel_reason_code
 *   catalogs.tire_positions        — fleet tire-positions route + TwoSectionLineEditor read
 *   catalogs.driver_load_statuses  — driver-load-statuses route + catalog-registry hub read
 *
 *   node scripts/verify-lst-link02-catalog-application-refs.mjs
 *   node scripts/verify-lst-link02-catalog-application-refs.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-link02-catalog-application-refs";

const ISLANDS = [
  {
    table: "catalogs.cargo_claim_reasons",
    backend: "apps/backend/src/safety/incidents.routes.ts",
    backendMust: [/FROM catalogs\.cargo_claim_reasons/i, /claim_reason_code/i],
    frontend: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
    frontendMust: [/cargo_claim_reason/i, /claim_reason_code/i],
    emptyOk: true,
    emptyNote: "0 prod rows — seed-only until first inline create; consumer + validator wired",
  },
  {
    table: "catalogs.wo_cancellation_reasons",
    backend: "apps/backend/src/work-orders/work-orders.routes.ts",
    backendMust: [/catalogs\.wo_cancellation_reasons/i, /cancel_reason_code/i],
    frontend: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    frontendMust: [/wo-cancellation-reasons|listWoCancellationReasons/i, /cancel_reason_code/i],
    emptyOk: false,
  },
  {
    table: "catalogs.tire_positions",
    // RE-ANCHOR (LST-LINK-02, found stale 2026-08-29): the route was refactored onto the shared
    // createCatalogRoutes factory (apps/backend/src/catalogs/fleet/factory.ts), which builds
    // `catalogs.${config.tableName}` at runtime — this specific wrapper file only carries the
    // config object (tableName: "tire_positions"), never the literal schema-qualified string.
    // Checking the factory + this file's config value together proves the same real wiring the
    // old literal-string check proved, without weakening it to accept a factory route that
    // DOESN'T actually pass a tire_positions tableName.
    backend: "apps/backend/src/catalogs/fleet/tire-positions.routes.ts",
    backendMust: [/tableName:\s*"tire_positions"/i],
    backendFactory: "apps/backend/src/catalogs/fleet/factory.ts",
    backendFactoryMust: [/catalogs\.\$\{config\.tableName\}/],
    frontend: "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx",
    frontendMust: [/tire-positions|tirePositionsCatalogClient/i],
    emptyOk: true,
    emptyNote: "0 prod rows — global position codes; Lists + tire UI read wired",
  },
  {
    table: "catalogs.driver_load_statuses",
    backend: "apps/backend/src/catalogs/driver-load-statuses.routes.ts",
    backendMust: [/catalogs\.driver_load_statuses/i],
    frontend: "apps/backend/src/catalogs/catalog-registry.routes.ts",
    frontendMust: [/catalogs\.driver_load_statuses/i],
    emptyOk: false,
    listsOnly: true,
    listsNote: "Phase 3 trips/stops consumer pending — Lists hub + CRUD route reference catalog today",
  },
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** @returns {string[]} */
export function collectProblems() {
  const problems = [];

  for (const island of ISLANDS) {
    for (const rel of [island.backend, island.frontend]) {
      if (!fs.existsSync(path.join(ROOT, rel))) {
        problems.push(`${island.table}: missing file ${rel}`);
        continue;
      }
      const src = read(rel);
      const patterns = rel === island.backend ? island.backendMust : island.frontendMust;
      for (const re of patterns) {
        if (!re.test(src)) {
          problems.push(`${island.table}: ${rel} missing ${re}`);
        }
      }
    }
    if (island.backendFactory) {
      if (!fs.existsSync(path.join(ROOT, island.backendFactory))) {
        problems.push(`${island.table}: missing factory file ${island.backendFactory}`);
      } else {
        const factorySrc = read(island.backendFactory);
        for (const re of island.backendFactoryMust || []) {
          if (!re.test(factorySrc)) {
            problems.push(`${island.table}: ${island.backendFactory} missing ${re}`);
          }
        }
      }
    }

    if (island.listsOnly && !island.listsNote) {
      problems.push(`${island.table}: listsOnly island must carry listsNote`);
    }
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const broken = collectProblems();
  // Pre-fix would fail wo cancel — if still failing after fix, selftest uses real
  if (broken.length === 0) {
    // JANITOR (2026-08-05): this block used to build a mutated copy of work-orders.routes.ts and
    // write it to `.tmp-selftest-wo.ts` in the REPO ROOT, with no cleanup — so every --selftest run
    // left an untracked file behind and the next lane's pre-push hook failed on a dirty tree.
    //
    // The write was also DEAD: `collectProblems()` reads the real repo files, so the mutated copy was
    // never read back by anything. Moving it to os.tmpdir() traded one defect for another (CodeQL
    // js/insecure-temporary-file — predictable filename), so the write is removed outright.
    //
    // HONESTY: removing a no-op changes no assertion, and it does NOT make this selftest stronger.
    // The mutation never reached the code path being checked, so the "pre-fix would fail" probe below
    // has always been vacuous. That pre-existing weakness is called out in this PR's REMAINING rather
    // than papered over — fixing it means giving collectProblems() a root argument, which is a change
    // to another guard's contract and belongs in its own PR.
  }
  const realAfterFix = collectProblems();
  if (realAfterFix.length) {
    console.error(`${LABEL} --selftest FAIL (implement WO cancel wiring):`, realAfterFix);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — four FK-island catalogs have application-level consumers`);
}
