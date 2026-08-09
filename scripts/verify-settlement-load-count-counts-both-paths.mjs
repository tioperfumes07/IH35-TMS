#!/usr/bin/env node
/**
 * ACCT-F275 — settlement `load_count` must count the covered loads through BOTH linkages.
 *
 * The two load_count subqueries in settlements.routes.ts counted `db.load_id` over an INNER JOIN on
 * source_driver_bill_id. A settlement line that carries only the denormalized settlement_lines.load_id
 * was DROPPED BY THE JOIN and never counted — so the Settlements screen showed "0 loads" for a
 * settlement that plainly covers one.
 *
 * Verified live on prod br-fancy-credit-akjnd07a before the fix: S-20260808-0085 and S-20260808-0090
 * each cover exactly one load, and the shipped query returned load_count = 0 for both.
 *
 * THE TRAP THIS GUARD EXISTS FOR: the failure is the JOIN TYPE, not the projection. Counting
 * COALESCE(db.load_id, sl.load_id) over an *INNER* join still drops every bill-less line while
 * LOOKING correct at a glance — the COALESCE reads as "both paths" but the join has already discarded
 * the rows. A guard that only grepped for COALESCE would go green on exactly the broken shape. So the
 * join type is asserted separately, and the selftest plants that precise shape.
 *
 * driver_bills.load_id stays CANONICAL (first in the COALESCE) per the ACCT-F275 ruling;
 * settlement_lines.load_id is the denormalized fallback. Same rule and same COALESCE order as the
 * ACCT-F290 bookend CTE — one rule, two call sites, so the two cannot drift apart.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/driver-finance/settlements.routes.ts";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/).*$/gm, "");

/** Returns { failures, sites } — sites is the DENOMINATOR, printed even on success. */
function check(src) {
  const clean = strip(src);
  const failures = [];

  // Anchor on the projection alias, so a renamed subquery cannot silently escape the guard.
  const sites = [...clean.matchAll(/\)\s*AS load_count/g)];
  if (sites.length === 0) {
    failures.push(`${ROUTES}: no 'AS load_count' subquery found — guard is looking at the wrong file`);
    return { failures, sites: 0 };
  }

  sites.forEach((m, i) => {
    // Walk back to the SELECT COUNT that opens this subquery.
    const end = m.index;
    const start = clean.lastIndexOf("SELECT COUNT(", end);
    if (start === -1 || start > end) {
      failures.push(`${ROUTES}: load_count site ${i + 1} — could not locate its SELECT COUNT(`);
      return;
    }
    const q = clean.slice(start, end);

    if (!/COUNT\(\s*DISTINCT\s+COALESCE\(\s*db\.load_id\s*,\s*sl\.load_id\s*\)\s*\)/.test(q)) {
      failures.push(
        `${ROUTES}: load_count site ${i + 1} does not COUNT DISTINCT COALESCE(db.load_id, sl.load_id) — ` +
          `a line carrying only the denormalized settlement_lines.load_id is never counted (ACCT-F275)`
      );
    }
    // THE LOAD-BEARING ASSERTION: the join must be LEFT.
    if (!/LEFT JOIN\s+driver_finance\.driver_bills\s+db/.test(q)) {
      failures.push(
        `${ROUTES}: load_count site ${i + 1} INNER-joins driver_finance.driver_bills — the join drops ` +
          `every bill-less line BEFORE the COALESCE can see it, so the count is wrong even though the ` +
          `projection looks right (ACCT-F275)`
      );
    }
    // The filter must use the COALESCE too, or fallback rows are discarded at the WHERE.
    if (!/COALESCE\(\s*db\.load_id\s*,\s*sl\.load_id\s*\)\s+IS NOT NULL/.test(q)) {
      failures.push(
        `${ROUTES}: load_count site ${i + 1} still filters on a bare 'db.load_id IS NOT NULL' rather ` +
          `than the COALESCE — fallback rows are discarded at the WHERE (ACCT-F275)`
      );
    }
    // Canonical order: driver_bills.load_id must come FIRST.
    if (/COALESCE\(\s*sl\.load_id\s*,\s*db\.load_id\s*\)/.test(q)) {
      failures.push(
        `${ROUTES}: load_count site ${i + 1} puts sl.load_id first in the COALESCE — driver_bills.load_id ` +
          `is CANONICAL and the denormalized copy must only ever be the fallback (ACCT-F275)`
      );
    }
  });

  return { failures, sites: sites.length };
}

function selftest() {
  const src = readFileSync(join(ROOT, ROUTES), "utf8");
  let probes = 0;

  const mutations = [
    {
      name: "reverted to counting db.load_id over an INNER join (the original defect)",
      apply: (s) =>
        s
          .replace(/COUNT\(DISTINCT COALESCE\(db\.load_id, sl\.load_id\)\)/g, "COUNT(DISTINCT db.load_id)")
          .replace(/LEFT JOIN driver_finance\.driver_bills db/g, "JOIN driver_finance.driver_bills db"),
    },
    {
      name: "COALESCE kept but join downgraded to INNER — the shape a naive guard passes",
      apply: (s) => s.replace(/LEFT JOIN driver_finance\.driver_bills db/g, "JOIN driver_finance.driver_bills db"),
    },
    {
      name: "COALESCE order inverted so the denormalized copy wins over canonical",
      apply: (s) =>
        s.replace(/COALESCE\(db\.load_id, sl\.load_id\)/g, "COALESCE(sl.load_id, db.load_id)"),
    },
    {
      name: "WHERE filter reverted to the bare canonical column",
      apply: (s) =>
        s.replace(/AND COALESCE\(db\.load_id, sl\.load_id\) IS NOT NULL/g, "AND db.load_id IS NOT NULL"),
    },
  ];

  for (const mut of mutations) {
    const mutated = mut.apply(src);
    if (mutated === src) {
      console.error(`SELFTEST INERT: mutation "${mut.name}" did not apply — the guard proves nothing.`);
      process.exit(1);
    }
    if (check(mutated).failures.length === 0) {
      console.error(`SELFTEST FAILED: guard stayed green with ${mut.name}.`);
      process.exit(1);
    }
    probes++;
  }
  return probes;
}

const probes = selftest();
const { failures, sites } = check(readFileSync(join(ROOT, ROUTES), "utf8"));

if (failures.length > 0) {
  console.error("ACCT-F275 FAIL — settlement load_count does not count both linkages:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `ACCT-F275 PASS — load_count subqueries checked: ${sites} of ${sites} in ${ROUTES}; ` +
    `mutation probes proven non-inert: ${probes}. Each site counts DISTINCT ` +
    `COALESCE(db.load_id, sl.load_id) over a LEFT JOIN, with the COALESCE gating the NULL filter and ` +
    `driver_bills.load_id canonical-first. Probe 2 is the load-bearing one: COALESCE over an INNER ` +
    `join reads as "both paths" while the join has already dropped the rows.`
);
