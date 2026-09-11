export default {
  name: "verify-driver-licence-documents-linked",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-licence-documents-linked.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-licence-documents-linked.mjs"]);
  },
};
