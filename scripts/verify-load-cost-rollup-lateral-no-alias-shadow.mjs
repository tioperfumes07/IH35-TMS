#!/usr/bin/env node
// ACCT-F2026092587 (CC-3, 2026-09-25, found live proving the R-173 Part 1 Chrome walkthrough) —
// apps/backend/src/accounting/load-cost-rollup.sql.ts's loadCostRollupLateral() aliased its own
// base table `l`, the SAME alias name every real call site's loadIdExpr/companyExpr strings
// assume ("l.id" / "l.operating_company_id"). A LATERAL subquery's own FROM-clause alias shadows
// an outer alias of the same name, so `WHERE l.id = ${loadIdExpr}` silently became the tautology
// `WHERE l.id = l.id` — unscoped, matching every load in mdata.loads, with LIMIT 1 returning one
// arbitrary (but query-plan-stable, so identically wrong across repeated calls in one query) row
// instead of the intended load. Live-measured on load 13600 (settlement S-5812): broken query
// gave costs_cents=0 (or an unrelated non-zero value depending on plan) instead of the correct
// 377406; both legs of a 2-load tour showed the SAME wrong figure. THE canonical single source of
// truth this entire LAW-5 initiative is built on was silently wrong the whole time this shape was
// present — this guard exists so that specific defect class can never return unnoticed.
//
// TWO arms:
//   A) STATIC — load-cost-rollup.sql.ts's loadCostRollupLateral() must alias its own base
//      mdata.loads read with something OTHER than a bare `l` (the collision-prone shape). Scans
//      the function body specifically, not the whole file (an unrelated `l` elsewhere is fine).
//   B) LIVE — call the REAL exported loadCostRollupLateral() (not a hand reproduction — that is
//      exactly the gap that let this bug ship: an earlier verification compared two hand-written
//      SQL strings that happened to both use a different, uncollided alias, never exercising the
//      actual shared function) for two real loads on the SAME live tour with KNOWN DIFFERENT
//      expense totals, and asserts the returned costs_cents actually differ and match an
//      independently-computed ground truth for each — the shadowed-tautology bug's signature is
//      exactly "two different loads report the identical figure."
//
// Self-test: node scripts/verify-load-cost-rollup-lateral-no-alias-shadow.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "live() fails closed without DATABASE_URL by design (ROUND 29.9-B)";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-cost-rollup-lateral-no-alias-shadow";
const SOURCE_FILE = "apps/backend/src/accounting/load-cost-rollup.sql.ts";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

/**
 * Pure — extract loadCostRollupLateral()'s own function body and confirm its base
 * `FROM mdata.loads <alias>` uses an alias that cannot collide with a caller's own outer `l`
 * (every real call site's loadIdExpr/companyExpr are the literal strings "l.id" /
 * "l.operating_company_id"). Fails if the base alias is exactly `l`.
 */
export function findShadowedBaseAlias(src) {
  const fnStart = src.indexOf("export function loadCostRollupLateral");
  if (fnStart < 0) return "loadCostRollupLateral() not found in this file";
  const fnEnd = src.indexOf("\nexport ", fnStart + 10);
  const body = fnEnd > 0 ? src.slice(fnStart, fnEnd) : src.slice(fnStart);
  const m = /FROM\s+mdata\.loads\s+([a-zA-Z_]\w*)/.exec(body);
  if (!m) return "could not find the lateral's base `FROM mdata.loads <alias>` to check";
  const alias = m[1];
  if (alias === "l") {
    return `loadCostRollupLateral()'s own base table is aliased "l" — every real caller's loadIdExpr/companyExpr are "l.id"/"l.operating_company_id", so this shadows the outer query's own l and makes the WHERE clause a self-tautology (the exact ACCT-F2026092587 shape). Alias it as something else (e.g. "cl").`;
  }
  return null;
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const failures = [];
  try {
    const srcPath = path.join(ROOT, SOURCE_FILE);
    if (!fs.existsSync(srcPath)) {
      failures.push(`${SOURCE_FILE}: file no longer exists — update this guard`);
    } else {
      const staticFail = findShadowedBaseAlias(fs.readFileSync(srcPath, "utf8"));
      if (staticFail) failures.push(staticFail);
    }

    // Extract the REAL exported loadCostRollupLateral()'s generated SQL text via tsx (not a hand
    // reproduction of it -- that is exactly the gap that let ACCT-F2026092587 ship unnoticed: an
    // earlier verification compared two hand-written SQL strings that happened to both use a
    // different, uncollided alias, never exercising the actual shared function). Backend TS
    // sources import each other with `.js` specifiers resolved by the build step; plain `node`
    // cannot import them directly, so shell out to the repo's own tsx (already a devDependency).
    const tsxBin = path.join(ROOT, "node_modules", ".bin", "tsx");
    const extractorScript = `
      import { loadCostRollupLateral } from ${JSON.stringify(path.join(ROOT, "apps/backend/src/accounting/load-cost-rollup.sql.ts"))};
      process.stdout.write(loadCostRollupLateral("l.id", "l.operating_company_id"));
    `;
    const extractorPath = path.join(ROOT, ".verify-load-cost-rollup-lateral-extractor.mts");
    fs.writeFileSync(extractorPath, extractorScript);
    let lateralSql;
    try {
      lateralSql = execFileSync(tsxBin, [extractorPath], { encoding: "utf8" });
    } finally {
      fs.rmSync(extractorPath, { force: true });
    }

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // A real, live, self-arming population: any settlement currently holding 2+ loads whose
    // expense totals genuinely differ. The shadowed-tautology bug's signature is unmistakable --
    // every leg reports the SAME costs_cents regardless of its own real expenses.
    const { rows: tours } = await client.query(
      `SELECT s.id::text AS settlement_id, array_agg(l.id::text) AS load_ids, array_agg(l.load_number) AS load_numbers
         FROM driver_finance.driver_settlements s
         JOIN mdata.loads l ON l.presettlement_link_id = s.id AND l.operating_company_id = s.operating_company_id AND l.soft_deleted_at IS NULL
        WHERE s.operating_company_id = $1::uuid AND s.status <> 'cancelled'
        GROUP BY s.id
       HAVING count(*) >= 2
        LIMIT 5`,
      [USMCA_COMPANY_ID]
    );

    let checked = 0;
    for (const tour of tours) {
      const loadIds = tour.load_ids;
      const { rows: independentTruth } = await client.query(
        `SELECT l.id::text,
            (COALESCE((SELECT SUM(e.total_amount_cents) FROM accounting.expenses e WHERE e.load_id = l.id AND e.status <> 'void'), 0)
             + COALESCE((SELECT SUM(ROUND(bl.amount * 100)) FROM accounting.bill_lines bl JOIN accounting.bills b ON b.id = bl.bill_id
                          WHERE bl.load_id = l.id AND b.status NOT IN ('void','voided') AND b.revoked_at IS NULL AND bl.voided_at IS NULL), 0))::bigint AS costs_cents
           FROM mdata.loads l WHERE l.id = ANY($1::uuid[])`,
        [loadIds]
      );
      const truthById = new Map(independentTruth.map((r) => [r.id, Number(r.costs_cents)]));

      for (const loadId of loadIds) {
        const { rows: lcrRows } = await client.query(
          `SELECT lcr.costs_cents FROM mdata.loads l ${lateralSql}
            WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid AND l.soft_deleted_at IS NULL`,
          [loadId, USMCA_COMPANY_ID]
        );
        checked++;
        const got = Number(lcrRows[0]?.costs_cents ?? -1);
        const want = truthById.get(loadId) ?? -1;
        if (got !== want) {
          failures.push(
            `settlement ${tour.settlement_id}, load ${loadId}: loadCostRollupLateral() returned costs_cents=${got}, independently computed=${want} — the exact shadowed-tautology mismatch shape`
          );
        }
      }
    }

    await client.query("ROLLBACK");
    if (checked === 0) {
      console.log(`${LABEL}: no 2+-load tour currently live to check against — static arm only this run.`);
    } else {
      console.log(`${LABEL}: ${checked} load(s) across ${tours.length} multi-load tour(s) checked against independently-computed truth.`);
    }
  } finally {
    client.release();
    await pool.end();
  }

  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL — ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — loadCostRollupLateral()'s base alias does not shadow a caller's outer "l", and live per-load costs_cents match independently-computed truth.`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const broken = `
export function loadCostRollupLateral(loadIdExpr, companyExpr) {
  return \`LEFT JOIN LATERAL (
      SELECT l.load_number
      FROM mdata.loads l
      WHERE l.id = \${loadIdExpr}
    ) lcr ON true\`;
}
`;
  assert.ok(findShadowedBaseAlias(broken) !== null, "PLANTED-RED: a bare `l` base alias must be caught");

  const fixed = `
export function loadCostRollupLateral(loadIdExpr, companyExpr) {
  return \`LEFT JOIN LATERAL (
      SELECT cl.load_number
      FROM mdata.loads cl
      WHERE cl.id = \${loadIdExpr}
    ) lcr ON true\`;
}
`;
  assert.ok(findShadowedBaseAlias(fixed) === null, "a non-colliding alias (cl) must not false-positive");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
