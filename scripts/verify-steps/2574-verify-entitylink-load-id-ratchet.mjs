export default {
  name: "verify:entitylink-load-id-ratchet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entitylink-load-id-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entitylink-load-id-ratchet.mjs"]);
  },
};
