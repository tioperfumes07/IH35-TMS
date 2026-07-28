/** SAF-B29 — the shared driver picker truncated at 200 on all 23 surfaces that use it. */
export default {
  name: "verify-shared-driver-picker-server-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-shared-driver-picker-server-search.mjs"]);
    await ctx.run("node", ["scripts/verify-shared-driver-picker-server-search.mjs", "--selftest"]);
  },
};
