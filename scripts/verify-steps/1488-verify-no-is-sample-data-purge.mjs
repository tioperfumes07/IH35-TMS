// 1488-verify-no-is-sample-data-purge — never DELETE rows selected by the is_sample_data flag.
//
// WHY: GUARD measured the flag on prod 2026-07-25 — FALSE on 176 real rows, TRUE on 17 fixtures. It carries
// ZERO signal. A purge filtered on it would BOTH miss real fixtures AND permanently destroy real business
// data for a live carrier. The owner's 2026-07-25 ruling that authorises deleting verified demo fixtures
// explicitly does NOT extend to flag-filtered deletes; that stays banned.
//
// Before this guard nothing enforced it. `DELETE FROM mdata.units WHERE is_sample_data = true` would have
// passed every check in the repo except the hold-merge-gate, which is satisfiable with a label — i.e. the
// single most dangerous statement anyone could write here was one approval click from prod.
//
// WHAT IS STILL ALLOWED — reading. `filters.push("is_sample_data IS NOT TRUE")` (units.routes.ts:194),
// `AND d.is_sample_data IS NOT TRUE` (driver-scheduler) and friends are the correct way to hide fixtures
// from live views, and demo-data-exclusion.guard.test.ts requires them to stay. Only DELETE is banned.
// UPDATE is allowed too: correcting a mis-flag is a repair, and migration 202608060000 does exactly that.
//
// THE LEGAL WAY to remove a fixture is an exact business identifier — unit_number LIKE 'DEMO-%',
// load_number LIKE 'DEMO-L%', work_orders.display_id LIKE 'DEMO-WO-%', drivers.last_name ILIKE 'Demo %' —
// under an explicit owner ruling, with a derived count and a referential pre-flight.
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["db/migrations", "apps/backend/src", "scripts"];
const SELF = "1488-verify-no-is-sample-data-purge.mjs";

// A DELETE whose statement body mentions is_sample_data before the terminating semicolon.
// Deliberately statement-scoped: a file may legitimately contain a DELETE and, separately, an
// is_sample_data read. Only their combination inside one statement is the defect.
const DELETE_STMT = /\bDELETE\s+FROM\s+[^;]*?;/gis;

export function findFlagFilteredDeletes(source) {
  const hits = [];
  for (const m of source.matchAll(DELETE_STMT)) {
    if (/is_sample_data/i.test(m[0])) {
      hits.push(m[0].replace(/\s+/g, " ").trim().slice(0, 160));
    }
  }
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(p, out);
    } else if (/\.(sql|ts|mjs|js)$/.test(e.name) && e.name !== SELF) {
      out.push(p);
    }
  }
  return out;
}

export default {
  name: "verify:no-is-sample-data-purge",
  run() {
    // selftest — both arms, so neither can pass vacuously.
    const bad = `DELETE FROM mdata.units WHERE is_sample_data = true;`;
    if (!findFlagFilteredDeletes(bad).length) {
      throw new Error("SELFTEST FAILED: a planted flag-filtered DELETE was not caught");
    }
    // The legitimate shapes must NOT be flagged, or this guard would force removal of the exclusion
    // filters that demo-data-exclusion.guard.test.ts requires to stay.
    const ok = [
      `filters.push("is_sample_data IS NOT TRUE");`,
      `SELECT * FROM mdata.units WHERE is_sample_data IS NOT TRUE;`,
      `UPDATE mdata.units SET is_sample_data = false WHERE unit_number NOT LIKE 'DEMO-%';`,
      `DELETE FROM mdata.units WHERE unit_number LIKE 'DEMO-%';`,
    ].join("\n");
    const falsePositives = findFlagFilteredDeletes(ok);
    if (falsePositives.length) {
      throw new Error(`SELFTEST FAILED: legitimate shapes were flagged — ${falsePositives.join(" | ")}`);
    }

    const problems = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        for (const stmt of findFlagFilteredDeletes(fs.readFileSync(file, "utf8"))) {
          problems.push(
            `${file}: DELETE filtered on is_sample_data — "${stmt}". That flag is false on 176 real rows ` +
              `and true on 17 fixtures (prod, 2026-07-25): it would destroy real business data and still ` +
              `miss fixtures. Scope the delete by an exact business identifier under an owner ruling.`,
          );
        }
      }
    }
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:no-is-sample-data-purge FAIL — ${problems.length} flag-filtered delete(s)`);
    }
    console.log("verify:no-is-sample-data-purge OK — no DELETE selects rows by is_sample_data; reads and mis-flag repairs untouched.");
    return 0;
  },
};
