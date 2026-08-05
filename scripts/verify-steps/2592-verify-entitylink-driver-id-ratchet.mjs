// verify-entitylink-driver-id-ratchet — §9.0 item 17 pattern sweep
export default {
  name: "verify:entitylink-driver-id-ratchet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entitylink-driver-id-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entitylink-driver-id-ratchet.mjs"]);
  },
};
