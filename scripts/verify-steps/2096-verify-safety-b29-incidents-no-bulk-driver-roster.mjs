// SAF-B29 wave-6 — incidents cluster no bulk listDrivers (claim 2096).
import { collectProblems } from "../verify-safety-b29-incidents-no-bulk-driver-roster.mjs";
export default {
  name: "safety-b29-incidents-no-bulk-driver-roster",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "safety-b29-incidents-no-bulk-driver-roster FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
