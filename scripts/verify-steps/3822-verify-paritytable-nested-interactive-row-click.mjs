export default {
  name: "verify-paritytable-nested-interactive-row-click",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-paritytable-nested-interactive-row-click.mjs"]);
  },
};
