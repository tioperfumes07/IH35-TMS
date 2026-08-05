// verify-entitylink-unit-id-ratchet — §9.0 item 17 pattern sweep
export default {
  name: "verify:entitylink-unit-id-ratchet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entitylink-unit-id-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entitylink-unit-id-ratchet.mjs"]);
  },
};
