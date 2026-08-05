import { collectProblems } from "../verify-settlement-dispute-driver-entity-picker.mjs";
export default {
  name: "settlement-dispute-driver-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) throw new Error("settlement-dispute-driver-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "));
  },
};
