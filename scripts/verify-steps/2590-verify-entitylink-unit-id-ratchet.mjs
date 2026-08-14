// Unit-column systemic ratchets: canonical EntityLink ids and exact leaf-specific Built claims.
export default {
  name: "verify:entitylink-unit-id-ratchet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entitylink-unit-id-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entitylink-unit-id-ratchet.mjs"]);
    await ctx.run("node", ["scripts/verify-wave-a-unit-built-claims-leaf-specific.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wave-a-unit-built-claims-leaf-specific.mjs"]);
  },
};
