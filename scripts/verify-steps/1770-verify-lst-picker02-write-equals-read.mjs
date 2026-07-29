export default {
  name: "verify-lst-picker02-write-equals-read",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker02-write-equals-read.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker02-write-equals-read.mjs"]);
  },
};
