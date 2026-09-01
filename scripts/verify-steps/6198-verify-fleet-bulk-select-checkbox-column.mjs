/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-fleet-bulk-select-checkbox-column",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-bulk-select-checkbox-column.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fleet-bulk-select-checkbox-column.mjs"]);
    // SEL-01 piggyback — selectAll must not alias selectPage (same bulk selection class).
    await ctx.run("node", ["scripts/verify-sel-01-select-all-matching.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-sel-01-select-all-matching.mjs"]);
  },
};
