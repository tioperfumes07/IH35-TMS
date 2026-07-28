/** FUEL-07 — a partial IFTA jurisdiction set cannot produce a filable quarterly return. */
export default {
  name: "verify-fuel-ifta-jurisdictions-complete",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-ifta-jurisdictions-complete.mjs"]);
    await ctx.run("node", ["scripts/verify-fuel-ifta-jurisdictions-complete.mjs", "--selftest"]);
  },
};
