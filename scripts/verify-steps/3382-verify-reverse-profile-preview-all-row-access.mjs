export default {
  name: "verify-reverse-profile-preview-all-row-access",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reverse-profile-preview-all-row-access.mjs"]);
  },
};
