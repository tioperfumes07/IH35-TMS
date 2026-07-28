/** The parity parser must stop at each ALTER's terminator — an unbounded window invents baseline columns. */
export default {
  name: "verify-schema-parity-window-bounded",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-schema-parity-window-bounded.mjs"]);
  },
};
