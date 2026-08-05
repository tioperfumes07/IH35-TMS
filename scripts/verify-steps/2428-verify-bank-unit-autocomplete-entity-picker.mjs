// Banking UnitAutocomplete EntityPicker kind=unit (claim 2428).
import { collectProblems } from "../verify-bank-unit-autocomplete-entity-picker.mjs";

export default {
  name: "bank-unit-autocomplete-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "bank-unit-autocomplete-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
