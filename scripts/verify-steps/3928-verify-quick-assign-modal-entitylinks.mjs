export default {
  name: "verify-quick-assign-modal-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-quick-assign-modal-entitylinks.mjs"]);
    await ctx.run("node", ["scripts/verify-fleet-vehicle-swap-event.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fleet-vehicle-swap-event.mjs"]);
  },
};
