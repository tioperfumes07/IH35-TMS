export default {
  name: "verify-driver-profile-compact-layout",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-profile-compact-layout.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-profile-compact-layout.mjs"]);
  },
};
