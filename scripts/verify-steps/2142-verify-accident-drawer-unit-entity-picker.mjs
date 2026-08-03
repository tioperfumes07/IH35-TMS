// AccidentReportDrawer unit+load EntityPicker (claim 2142).
import { collectProblems } from "../verify-accident-drawer-unit-entity-picker.mjs";
export default {
  name: "accident-drawer-unit-entity-picker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "accident-drawer-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
