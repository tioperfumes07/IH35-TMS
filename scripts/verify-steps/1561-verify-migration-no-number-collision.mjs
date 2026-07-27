export default {
  name: "verify-migration-no-number-collision",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-migration-no-number-collision.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-migration-no-number-collision.mjs"]);
  },
};
