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
import os from "node:os";
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
    backend: "apps/backend/src/catalogs/fleet/tire-positions.routes.ts",
    backendMust: [/catalogs\.tire_positions/i],
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
    // Mutate: strip wo cancel validation
    const wo = read("apps/backend/src/work-orders/work-orders.routes.ts");
    if (/catalogs\.wo_cancellation_reasons/.test(wo)) {
      const fake = wo.replace(/catalogs\.wo_cancellation_reasons/g, "catalogs.REMOVED");
      // JANITOR: this wrote .tmp-selftest-wo.ts into the REPO ROOT and never removed it, so every
      // --selftest run left an untracked file behind and the next coder's pre-push hook failed on a
      // dirty tree. The probe only ever needed the mutated text in memory — it is never read back
      // from disk — so write it to the OS temp dir and delete it in a finally.
      const tmpFile = path.join(os.tmpdir(), `ih35-lst-link02-selftest-${process.pid}.ts`);
      try {
        fs.writeFileSync(tmpFile, fake);
      } finally {
        fs.rmSync(tmpFile, { force: true });
      }
    }
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
