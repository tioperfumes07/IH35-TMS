export default {
  name: "verify-bank-dom-05-intercompany-route-ui",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-dom-05-intercompany-route-ui.mjs"]);
  },
};
