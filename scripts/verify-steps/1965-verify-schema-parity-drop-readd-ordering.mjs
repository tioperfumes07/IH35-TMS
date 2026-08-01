export default {
  name: "verify-schema-parity-drop-readd-ordering",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-schema-parity-drop-readd-ordering.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-schema-parity-drop-readd-ordering.mjs"]);
  },
};
