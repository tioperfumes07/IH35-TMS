// Banking LoadAutocomplete EntityPicker kind=load (claim 2430).
import { collectProblems } from "../verify-bank-load-autocomplete-entity-picker.mjs";

export default {
  name: "bank-load-autocomplete-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "bank-load-autocomplete-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
