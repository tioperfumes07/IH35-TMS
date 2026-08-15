export default {
  name: "verify-safety-driver-profile-honest-identity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-driver-profile-honest-identity.mjs"]);
  },
};
