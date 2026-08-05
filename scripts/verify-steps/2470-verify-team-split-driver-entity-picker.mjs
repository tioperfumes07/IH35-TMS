import { collectProblems } from "../verify-team-split-driver-entity-picker.mjs";
export default {
  name: "team-split-driver-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) throw new Error("team-split-driver-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "));
  },
};
