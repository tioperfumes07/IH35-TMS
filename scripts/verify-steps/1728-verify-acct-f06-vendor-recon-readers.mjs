export default {
  name: "verify:acct-f06-vendor-recon-readers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-f06-vendor-recon-readers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-f06-vendor-recon-readers.mjs"]);
  },
};
