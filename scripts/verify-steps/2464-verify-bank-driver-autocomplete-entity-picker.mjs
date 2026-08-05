// DriverAutocomplete EntityPicker kind=driver (claim 2464).
import { collectProblems } from "../verify-bank-driver-autocomplete-entity-picker.mjs";

export default {
  name: "bank-driver-autocomplete-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "bank-driver-autocomplete-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
