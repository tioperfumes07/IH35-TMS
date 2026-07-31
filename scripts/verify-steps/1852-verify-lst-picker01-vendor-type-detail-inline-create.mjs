// LST-PICKER-01 VendorDetail vendor_type (claim 1852). NOT labor — #3877 owns labor_code@1850.
import { collectProblems } from "../verify-lst-picker01-vendor-type-detail-inline-create.mjs";
export default {
  name: "lst-picker01-vendor-type-detail-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-vendor-type-detail-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
