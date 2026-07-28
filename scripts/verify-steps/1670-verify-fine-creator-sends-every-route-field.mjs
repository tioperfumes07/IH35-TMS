/** SAF-B18 — a field the create route accepts and no UI ever sends stays null on every row forever. */
export default {
  name: "verify-fine-creator-sends-every-route-field",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fine-creator-sends-every-route-field.mjs"]);
    await ctx.run("node", ["scripts/verify-fine-creator-sends-every-route-field.mjs", "--selftest"]);
  },
};
