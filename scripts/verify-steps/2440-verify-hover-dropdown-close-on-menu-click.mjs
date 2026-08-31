export default {
  name: "verify-hover-dropdown-close-on-menu-click",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hover-dropdown-close-on-menu-click.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-hover-dropdown-close-on-menu-click.mjs"]);
  },
};
