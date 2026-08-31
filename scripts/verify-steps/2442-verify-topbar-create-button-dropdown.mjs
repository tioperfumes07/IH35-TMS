export default {
  name: "verify-topbar-create-button-dropdown",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-topbar-create-button-dropdown.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-topbar-create-button-dropdown.mjs"]);
  },
};
