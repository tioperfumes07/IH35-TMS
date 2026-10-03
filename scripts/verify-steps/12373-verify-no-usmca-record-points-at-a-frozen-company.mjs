// ROUND 373.5: a record references only its own company's driver, or a unit/equipment its company owns or currently
// leases — refused in the database by migration 202615360400. Import-safe static half: the refusal migration still
// declares its 34 document columns and the live guard is wired into the money gate.
import { existsSync, readFileSync } from "node:fs";
import { parseScope } from "../verify-no-usmca-record-points-at-a-frozen-company.mjs";

export default {
  name: "no-usmca-record-points-at-a-frozen-company",
  run: async () => {
    const mig = "db/migrations/202615360400_no_record_points_at_another_companys_unit_driver_trailer.sql";
    const failures = [];
    if (!existsSync(mig)) failures.push(`${mig} is missing — the cross-company refusal must live in the database`);
    else if (parseScope(readFileSync(mig, "utf8")).length < 34) failures.push(`${mig} declares fewer than the 34 document columns it was rehearsed with`);
    if (!readFileSync("scripts/money-pr-local-gate.mjs", "utf8").includes('"verify-no-usmca-record-points-at-a-frozen-company"')) {
      failures.push("verify-no-usmca-record-points-at-a-frozen-company is not wired into money-pr-local-gate");
    }
    if (failures.length) throw new Error("no-usmca-record-points-at-a-frozen-company FAIL:\n  " + failures.join("\n  "));
  },
};
