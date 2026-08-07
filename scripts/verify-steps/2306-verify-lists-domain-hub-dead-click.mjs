// Lists /lists/:domain catch-all no longer dead-clicks to ComingSoon (CLS-DEAD-CLICK · claim 2306).
import { collectProblems } from "../verify-lists-domain-hub-dead-click.mjs";

export default {
  name: "verify-lists-domain-hub-dead-click",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-domain-hub-dead-click.mjs", "--selftest"]);
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "verify-lists-domain-hub-dead-click FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
