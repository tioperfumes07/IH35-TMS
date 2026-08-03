// CreateAdvanceModal DriverPickerWithCreate (claim 2102).
import { collectProblems } from "../verify-cash-advance-driver-picker-search.mjs";
export default {
  name: "cash-advance-driver-picker-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "cash-advance-driver-picker-search FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
