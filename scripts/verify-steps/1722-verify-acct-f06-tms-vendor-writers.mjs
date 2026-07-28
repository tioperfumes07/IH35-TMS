export default {
  name: "verify:acct-f06-tms-vendor-writers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-f06-tms-vendor-writers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-f06-tms-vendor-writers.mjs"]);
  },
};
