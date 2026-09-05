export default {
  name: "verify-load-with-crew-is-not-draft",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-with-crew-is-not-draft.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-with-crew-is-not-draft.mjs"]);
  },
};
