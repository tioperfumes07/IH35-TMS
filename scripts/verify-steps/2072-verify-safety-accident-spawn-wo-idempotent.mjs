/** SAF-B30 — accident spawn-wo idempotent + reloadable linked AC WOs. */
export default {
  name: "verify-safety-accident-spawn-wo-idempotent",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-accident-spawn-wo-idempotent.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-accident-spawn-wo-idempotent.mjs", "--selftest"]);
  },
};
