// AccidentsPage list filter EntityPickers (claim 2160 — Cursor even).
import { collectProblems } from "../verify-safety-accidents-list-filters.mjs";

export default {
  name: "safety-accidents-list-filters",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-accidents-list-filters.mjs", "--selftest"]);
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "safety-accidents-list-filters FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
