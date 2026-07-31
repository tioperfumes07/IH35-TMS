// LEASE-BRIDGE activate → ASC 842 operating JEs (claim 1880).
export default {
  name: "verify-lease-bridge-activate-operating-jes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lease-bridge-activate-operating-jes.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lease-bridge-activate-operating-jes.mjs"]);
  },
};
