// CALENDAR/DATE — Compliance425CPage Timestamp column must use formatDateTimeUS (claim 2310).
import { collectProblems } from "../verify-maintenance-compliance425c-timestamp-format.mjs";

export default {
  name: "verify-maintenance-compliance425c-timestamp-format",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maintenance-compliance425c-timestamp-format.mjs", "--selftest"]);
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "verify-maintenance-compliance425c-timestamp-format FAIL:\n  " +
          problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
