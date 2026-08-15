export default {
  name: "verify-lists-account-types-lookup-no-updated-at",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-account-types-lookup-no-updated-at.mjs"]);
  },
};
