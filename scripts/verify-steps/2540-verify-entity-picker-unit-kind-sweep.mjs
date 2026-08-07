// EP-UNIT-KIND-SWEEP generalized guard (claim 2540 · Cursor EVEN).
import { collectProblems } from "../verify-entity-picker-unit-kind-sweep.mjs";

export default {
  name: "entity-picker-unit-kind-sweep",
  run: async (ctx) => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "entity-picker-unit-kind-sweep FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
    await ctx.run("node", ["scripts/verify-entity-picker-unit-kind-sweep.mjs", "--selftest"]);
  },
};
