// RecordExpenseForm unit EntityPicker (claim 2438).
import { collectProblems } from "../verify-record-expense-unit-entity-picker.mjs";

export default {
  name: "record-expense-unit-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "record-expense-unit-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
