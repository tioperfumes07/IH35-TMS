// CashAdvanceRequests driver picker (claim 2134).
import { collectProblems } from "../verify-cash-advance-requests-driver-picker.mjs";
export default {
  name: "cash-advance-requests-driver-picker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "cash-advance-requests-driver-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
