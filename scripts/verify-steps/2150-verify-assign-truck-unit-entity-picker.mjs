import { collectProblems } from "../verify-assign-truck-unit-entity-picker.mjs";
export default {
  name: "assign-truck-unit-entity-picker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) throw new Error("assign-truck-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "));
  },
};
