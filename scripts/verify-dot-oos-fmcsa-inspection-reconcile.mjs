#!/usr/bin/env node
/**
 * GO-1405 P0 (owner packet IH35-FINISH-2026-08-29/CC-1) -- static-shape guard for the
 * maintenance dashboard's dot_oos/out_of_service reconciliation.
 *
 * Root cause fixed: dot_oos previously mirrored mdata.units.is_oos, which is itself just a
 * copy of status='OutOfService' (a fleet-operational/dispatch flag) -- confirmed live 1:1
 * correlated with status, zero mixed cases, across TRK and USMCA. That is NOT an FMCSA
 * 49 CFR 396 out-of-service condition, which is declared at inspection. The fix derives
 * dot_oos from safety.dot_inspections (most recent non-voided inspection per unit; a tie on
 * both inspection_date and created_at resolves toward OOS, never silently clearing the flag)
 * and unifies out_of_service to the same number -- eliminating the "three counts of one
 * concept in one payload" defect the packet named. severe_oos stays untouched (a genuinely
 * distinct concept: open severe-repair estimates).
 */
import { readFileSync } from "node:fs";

const routesPath = "apps/backend/src/maintenance/dashboard-kpis.routes.ts";
const src = readFileSync(routesPath, "utf8");

function analyze(text) {
  const failures = [];

  if (/hasIsOos/.test(text) || /"is_oos"/.test(text)) {
    failures.push(`${routesPath}: dot_oos (or a helper) still references mdata.units.is_oos -- must derive from safety.dot_inspections only`);
  }

  if (!/FROM safety\.dot_inspections di/.test(text)) {
    failures.push(`${routesPath}: dot_oos query no longer reads safety.dot_inspections`);
  }

  if (!/di\.voided_at IS NULL/.test(text)) {
    failures.push(`${routesPath}: dot_oos query has no voided_at exclusion -- a retracted inspection must not count`);
  }

  if (!/DISTINCT ON \(di\.unit_id\)/.test(text)) {
    failures.push(`${routesPath}: dot_oos query does not reduce to one row per unit (DISTINCT ON di.unit_id)`);
  }

  if (
    !/ORDER BY di\.unit_id, di\.inspection_date DESC, di\.created_at DESC, \(di\.outcome = 'OOS'\) DESC/.test(text)
  ) {
    failures.push(
      `${routesPath}: dot_oos "most recent inspection" ordering is missing its full tiebreaker (inspection_date DESC, created_at DESC, then OOS-favoring on an exact tie) -- live fixture data has genuine ties on both columns`
    );
  }

  if (!/COUNT\(\*\) FILTER \(WHERE outcome = 'OOS'\)::int AS dot_oos/.test(text)) {
    failures.push(`${routesPath}: dot_oos count no longer filters the latest-outcome-per-unit set on outcome = 'OOS'`);
  }

  if (!/out_of_service:\s*dotOos/.test(text)) {
    failures.push(`${routesPath}: out_of_service is not unified to the same dotOos value -- reintroduces "three counts of one concept"`);
  }

  return failures;
}

function selftest() {
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-dot-oos-fmcsa-inspection-reconcile --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "dot_oos reverted to is_oos mirror",
      apply: () =>
        src.replace(
          /let dotOos = 0;\n        if \(totalUnits > 0[\s\S]*?dotOos = Number\(oosRes\.rows\[0\]\?\.dot_oos \?\? 0\);\n        \}/,
          `let dotOos = 0;\n        const hasIsOos = await columnExists(client, "mdata", "units", "is_oos");\n        dotOos = hasIsOos ? 1 : 0; // is_oos`
        ),
    },
    {
      name: "voided_at exclusion removed",
      apply: () => src.replace("di.voided_at IS NULL\n                  AND ", ""),
    },
    {
      name: "tiebreaker collapsed to created_at only",
      apply: () =>
        src.replace(
          "ORDER BY di.unit_id, di.inspection_date DESC, di.created_at DESC, (di.outcome = 'OOS') DESC",
          "ORDER BY di.unit_id, di.created_at DESC"
        ),
    },
    {
      name: "out_of_service hardcoded back to 0",
      apply: () => src.replace("out_of_service: dotOos,", "out_of_service: 0,"),
    },
    {
      name: "DISTINCT ON per-unit reduction removed",
      apply: () => src.replace("DISTINCT ON (di.unit_id) di.outcome", "di.outcome"),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply();
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-dot-oos-fmcsa-inspection-reconcile --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught and repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-dot-oos-fmcsa-inspection-reconcile: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-dot-oos-fmcsa-inspection-reconcile: OK -- dot_oos derives from safety.dot_inspections (voided-excluding, per-unit latest by inspection_date/created_at with an OOS-favoring tiebreaker), out_of_service unified to the same number, is_oos no longer referenced"
  );
}
