export default {
  name: "verify-invoice-sent-requires-gl-posting",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-sent-requires-gl-posting.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-sent-requires-gl-posting.mjs"]);
  },
};
