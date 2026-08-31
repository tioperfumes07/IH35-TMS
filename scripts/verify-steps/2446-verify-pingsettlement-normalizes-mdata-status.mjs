export default {
  name: "verify-pingsettlement-normalizes-mdata-status",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pingsettlement-normalizes-mdata-status.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-pingsettlement-normalizes-mdata-status.mjs"]);
  },
};
