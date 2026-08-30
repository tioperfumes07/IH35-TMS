/** CERT-01 B2+B7 -- FW1,2,4,5,10,3 server assertion evaluator library, functionally tested. */
export default {
  name: "verify-cert01-fw-server-assertions",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cert01-fw-server-assertions.mjs"]);
    await ctx.run("node", ["scripts/verify-cert01-fw-server-assertions.mjs", "--selftest"]);
  },
};
