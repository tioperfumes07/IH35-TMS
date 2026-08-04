// CLS-SILENT-CAP — contract creator must not bulk listDrivers(limit:200) (claim 2312 · Cursor EVEN).
import { collectProblems } from "../verify-contract-creator-no-silent-driver-roster.mjs";

export default {
  name: "verify-contract-creator-no-silent-driver-roster",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-contract-creator-no-silent-driver-roster.mjs", "--selftest"]);
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "verify-contract-creator-no-silent-driver-roster FAIL:\n  " +
          problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
