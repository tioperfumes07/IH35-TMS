#!/usr/bin/env node
/**
 * GUARD: cancellation reports must resolve labels from the catalog dispatch WRITES from.
 *
 * WHY THIS EXISTS (2026-07-23 live audit)
 * Two report endpoints resolved the human label for a cancelled load by joining ONLY
 * catalogs.cancellation_reasons — a legacy, global, 9-row table. Dispatch writes reason codes from
 * catalogs.load_cancellation_reasons (entity-scoped, 63 rows / 21 distinct codes). Verified on the
 * prod branch: 12 of those 21 codes have NO row in the legacy table.
 *
 * Because the join is a LEFT JOIN wrapped in COALESCE(..., lc.reason_code), the miss does not error
 * — it silently renders the raw code. Operators would read FORCE_WEATHER, CUST_NO_SHOW_AT_PICKUP,
 * CARR_NO_AVAILABLE_DRIVER and OTHER in place of sentences.
 *
 * The fix keeps BOTH catalogs: the canonical entity-scoped one first, the legacy one as a fallback
 * tier, then the raw code. That is strictly additive — no label that resolved before can regress.
 *
 * This guard fails if a report goes back to legacy-only resolution.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cancellation-reason-label-source";
const SELFTEST = process.argv.includes("--selftest");

const FILES = [
  "apps/backend/src/dispatch/cancellations-report.routes.ts",
  "apps/backend/src/dispatch/load-cancellations-analytics.routes.ts",
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*(\/\/|--).*$/gm, "");
}

/** Injectable so the selftest can run the real assertion against mutated real source. */
export function assertLabelSource(sources) {
  const problems = [];
  for (const rel of FILES) {
    const code = stripComments(sources?.[rel] ?? read(rel));

    // Only inspect files that actually resolve a cancellation label.
    if (!/reason_label/.test(code)) continue;

    if (!/catalogs\.load_cancellation_reasons/.test(code)) {
      problems.push(
        `${rel}: resolves a cancellation label without joining catalogs.load_cancellation_reasons — ` +
          `12 of the 21 codes dispatch writes have no row in the legacy catalog and render as raw codes`
      );
      continue;
    }

    // The canonical catalog is entity-scoped; an unscoped join blends TRANSP/TRK/USMCA labels.
    // Bound the window at the NEXT join/where — a fixed-size lookahead spills into
    // `WHERE lc.operating_company_id = $1` and would pass an unscoped join.
    const joinBlock = /catalogs\.load_cancellation_reasons\s+\w+([\s\S]*?)(?=LEFT JOIN|JOIN\s|WHERE\s|$)/.exec(code);
    if (joinBlock && !/operating_company_id/.test(joinBlock[1])) {
      problems.push(
        `${rel}: joins catalogs.load_cancellation_reasons without an operating_company_id predicate — ` +
          `that table is entity-scoped and an unscoped join blends labels across entities`
      );
    }

    // The canonical label must be preferred over the legacy one.
    if (!/COALESCE\(\s*\w+\.display_name\s*,/.test(code)) {
      problems.push(
        `${rel}: does not prefer the canonical display_name — COALESCE must read ` +
          `display_name first, then the legacy reason_label, then the raw code`
      );
    }
  }
  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const failures = [];
  const target = FILES[0];

  const expectCaught = (name, mutated, expect) => {
    if (mutated[target] === live[target]) {
      failures.push(`${name}: mutation did not change the source — the case is inert`);
      return;
    }
    const problems = assertLabelSource(mutated);
    if (!problems.some((p) => p.includes(expect))) {
      failures.push(
        `${name}: planted defect was NOT caught (expected "${expect}", got: ${
          problems.length ? problems.join(" | ") : "no problems"
        })`
      );
    }
  };

  // Case 1: revert to legacy-only resolution.
  expectCaught(
    "legacy-only",
    {
      ...live,
      [target]: live[target]
        .replace(/LEFT JOIN catalogs\.load_cancellation_reasons[\s\S]*?lc\.operating_company_id\n/, "")
        .replace("COALESCE(lcr.display_name, r.reason_label", "COALESCE(r.reason_label"),
    },
    "without joining catalogs.load_cancellation_reasons"
  );

  // Case 2: entity scoping dropped from the canonical join.
  expectCaught(
    "unscoped-join",
    {
      ...live,
      [target]: live[target].replace(
        "           AND lcr.operating_company_id = lc.operating_company_id\n",
        ""
      ),
    },
    "without an operating_company_id predicate"
  );

  // Case 3: legacy label preferred over the canonical one.
  expectCaught(
    "wrong-precedence",
    {
      ...live,
      [target]: live[target].replace(
        "COALESCE(lcr.display_name, r.reason_label",
        "COALESCE(r.reason_label, lcr.display_name"
      ),
    },
    "does not prefer the canonical display_name"
  );

  const liveProblems = assertLabelSource(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertLabelSource();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — cancellation labels resolve from the catalog dispatch writes from`);
