export default {
  name: "verify-draft-load-saves-and-is-visible",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-draft-load-saves-and-is-visible.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-draft-load-saves-and-is-visible.mjs"]);
  },
};
