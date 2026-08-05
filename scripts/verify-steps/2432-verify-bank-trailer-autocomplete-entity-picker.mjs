// Banking TrailerAutocomplete EntityPicker kind=trailer (claim 2432).
import { collectProblems } from "../verify-bank-trailer-autocomplete-entity-picker.mjs";

export default {
  name: "bank-trailer-autocomplete-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "bank-trailer-autocomplete-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
