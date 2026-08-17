export default {
  name: "verify-maint-preflight-dvir-wo-join-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-preflight-dvir-wo-join-uuid.mjs"]);
  },
};
