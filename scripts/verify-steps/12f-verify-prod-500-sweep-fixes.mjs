import fs from "node:fs";
import path from "node:path";

// Regression guard for the 2026-06-28 PROD-500-SWEEP fixes (home /role-home + compliance dashboard).
// The read-query gate (12b) is the systemic guard for phantom columns; this pins these specific fixes.
export default {
  name: "verify-prod-500-sweep-fixes",
  run: async () => {
    const fails = [];
    const compliance = fs.readFileSync(
      path.resolve("apps/backend/src/compliance/compliance-aggregate.service.ts"), "utf8");
    if (/\be\.operating_company_id\b/.test(compliance)) {
      fails.push("compliance-aggregate.service.ts references e.operating_company_id — mdata.equipment has no such column (use owner_company_id / currently_leased_to_company_id).");
    }
    const home = fs.readFileSync(
      path.resolve("apps/backend/src/accounting/role-home/accounting-home.service.ts"), "utf8");
    if (/b\.payment_terms_id/.test(home) && !/columnExists\(/.test(home)) {
      fails.push("accounting-home.service.ts reads bills.payment_terms_id without a columnExists guard — accounting.bills has no payment_terms_id (home page 500).");
    }
    if (fails.length) {
      console.error("verify-prod-500-sweep-fixes FAILED:");
      for (const f of fails) console.error("  " + f);
      process.exit(1);
    }
    console.log("verify-prod-500-sweep-fixes OK — role-home + compliance phantom-read fixes intact.");
  },
};
