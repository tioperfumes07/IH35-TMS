// LST-PICKER-01 BookLoadModalV4 factoring vendor (claim 2098).
import { collectProblems } from "../verify-lst-picker01-bookload-factoring-vendor-inline-create.mjs";
export default {
  name: "lst-picker01-bookload-factoring-vendor-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-bookload-factoring-vendor-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
