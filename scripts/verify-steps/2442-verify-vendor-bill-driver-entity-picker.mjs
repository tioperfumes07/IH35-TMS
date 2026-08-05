// VendorBillForm driver EntityPicker (claim 2442).
import { collectProblems } from "../verify-vendor-bill-driver-entity-picker.mjs";

export default {
  name: "vendor-bill-driver-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "vendor-bill-driver-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
