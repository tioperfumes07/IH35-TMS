/** SAF-B29 wave 2 — limit:200 Safety pickers must search server-side (verify-step 2062 · Cursor EVEN). */
export default {
  name: "verify:safety-picker-server-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-picker-server-search.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-picker-server-search.mjs"]);
  },
};
