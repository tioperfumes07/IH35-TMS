#!/usr/bin/env node
/**
 * DRV-MONEY-F7311 — auto-deduction policy list loses the driver's name after deactivation/archive.
 *
 * The list query's driver join carried "AND d.deactivated_at IS NULL AND d.archived_at IS NULL" on
 * a LEFT JOIN used purely to resolve a display name. For a LEFT JOIN, an extra predicate on the
 * joined table doesn't just hide the driver's status — it drops the row match entirely the moment
 * the driver is deactivated/archived, turning a real, still-valid historical policy into a
 * permanently unlabeled "Driver — not visible" row even though canonical driver GET still returns
 * 200 with the driver's real name. Same defect class already fixed for dispatch loads (see
 * verify-dispatch-driver-label-survives-archive.mjs) and customers.
 *
 * Locked here: the driver_name projection must go through mdata.resolve_driver_label_same_company
 * (the durable, company-bound historical-label resolver with no deactivated_at/archived_at
 * predicate), not a plain filtered LEFT JOIN mdata.drivers.
 */
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/settlements/auto-deductions/policy.routes.ts";

export function run(root = process.cwd()) {
  const failures = [];
  let src;
  try {
    src = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  } catch {
    return [`${ROUTES_REL}: missing`];
  }

  if (!/mdata\.resolve_driver_label_same_company\(p\.driver_id,\s*p\.operating_company_id\)\s+AS\s+driver_name/.test(src)) {
    failures.push(
      `${ROUTES_REL}: driver_name must resolve via mdata.resolve_driver_label_same_company(p.driver_id, p.operating_company_id) — the durable historical-label resolver, not a filtered LEFT JOIN`
    );
  }

  // The regression this guard exists to catch: a LEFT JOIN mdata.drivers on this route that also
  // filters on deactivated_at/archived_at (which would drop a deactivated driver's row entirely,
  // reintroducing the exact "Driver — not visible" bug this fix closed).
  if (/LEFT JOIN mdata\.drivers[\s\S]{0,200}?(deactivated_at IS NULL|archived_at IS NULL)/.test(src)) {
    failures.push(
      `${ROUTES_REL}: must not LEFT JOIN mdata.drivers filtered on deactivated_at/archived_at for the driver_name projection — that drops deactivated/archived drivers' rows entirely (LEFT JOIN, not just visibility)`
    );
  }

  return failures;
}

function selftest() {
  const root = process.cwd();
  const baseline = run(root);
  if (baseline.length) {
    console.error("SELFTEST FAIL: repository already red.\n" + baseline.join("\n"));
    process.exit(1);
  }

  const original = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");

  // Plant: revert the resolver call back to a plain, filtered LEFT JOIN (the pre-fix shape).
  const planted = original.replace(
    /mdata\.resolve_driver_label_same_company\(p\.driver_id,\s*p\.operating_company_id\)\s+AS\s+driver_name/,
    `NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name`
  ).replace(
    "FROM driver_finance.auto_deduction_policies p\n          LEFT JOIN catalogs.driver_deduction_types ddt",
    `FROM driver_finance.auto_deduction_policies p
          LEFT JOIN mdata.drivers d
            ON d.id = p.driver_id
           AND d.operating_company_id = p.operating_company_id
           AND d.deactivated_at IS NULL
           AND d.archived_at IS NULL
          LEFT JOIN catalogs.driver_deduction_types ddt`
  );
  if (planted === original) {
    console.error("SELFTEST FAIL: plant pattern did not match anything to replace.");
    process.exit(1);
  }
  try {
    fs.writeFileSync(`${root}/${ROUTES_REL}`, planted, "utf8");
    const caught = run(root);
    if (!caught.length) {
      console.error("SELFTEST FAIL: planted regression not caught.");
      process.exit(1);
    }
    console.log(`  caught: ${caught.length} finding(s) on the pre-fix shape`);
  } finally {
    fs.writeFileSync(`${root}/${ROUTES_REL}`, original, "utf8");
  }

  const after = run(root);
  if (after.length) {
    console.error("SELFTEST FAIL: restore left repository red.\n" + after.join("\n"));
    process.exit(1);
  }
  console.log("SELFTEST PASS: planted regression caught and repository restored green.");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-auto-deduction-policy-driver-label-survives-archive FAIL:");
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log("verify-auto-deduction-policy-driver-label-survives-archive OK — driver_name survives deactivation/archive");
}
