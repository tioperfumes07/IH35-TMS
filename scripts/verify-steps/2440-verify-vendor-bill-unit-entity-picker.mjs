// VendorBillForm unit EntityPicker (claim 2440).
import { collectProblems } from "../verify-vendor-bill-unit-entity-picker.mjs";

export default {
  name: "vendor-bill-unit-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "vendor-bill-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
