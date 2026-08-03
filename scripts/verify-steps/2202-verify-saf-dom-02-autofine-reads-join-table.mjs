export default {
  name: "verify-saf-dom-02-autofine-reads-join-table",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-dom-02-autofine-reads-join-table.mjs"]);
  },
};
