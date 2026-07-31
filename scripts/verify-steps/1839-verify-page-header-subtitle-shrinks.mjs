// 1839-verify-page-header-subtitle-shrinks — PageHeader overlap.
// The subtitle was flex-shrink:0 alongside flex-shrink:0 actions, so on /maintenance a long subtitle
// rendered straight through three "+ Create" buttons. Asserts the subtitle can truncate AND that the
// action buttons still cannot — clipping a control is worse than clipping prose.
export default {
  name: "verify-page-header-subtitle-shrinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-page-header-subtitle-shrinks.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-page-header-subtitle-shrinks.mjs"]);
  },
};
