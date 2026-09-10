export default {
  name: "verify-fleet-edit-is-side-drawer",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-edit-is-side-drawer.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fleet-edit-is-side-drawer.mjs"]);
  },
};
