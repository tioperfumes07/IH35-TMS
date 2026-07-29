export default {
  name: "verify-lst-orph02-held-registry-truth",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-orph02-held-registry-truth.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-orph02-held-registry-truth.mjs"]);
  },
};
