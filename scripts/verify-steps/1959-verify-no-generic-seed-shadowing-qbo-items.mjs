export default {
  name: "verify-no-generic-seed-shadowing-qbo-items",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-generic-seed-shadowing-qbo-items.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-generic-seed-shadowing-qbo-items.mjs"]);
  },
};
