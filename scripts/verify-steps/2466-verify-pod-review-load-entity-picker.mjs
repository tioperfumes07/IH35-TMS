// PodReview load filter EntityPicker (claim 2466).
import { collectProblems } from "../verify-pod-review-load-entity-picker.mjs";

export default {
  name: "pod-review-load-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "pod-review-load-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
