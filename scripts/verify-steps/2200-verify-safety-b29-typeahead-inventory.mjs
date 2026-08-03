export default {
  name: "verify-safety-b29-typeahead-inventory",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-b29-typeahead-inventory.mjs"]);
  },
};
