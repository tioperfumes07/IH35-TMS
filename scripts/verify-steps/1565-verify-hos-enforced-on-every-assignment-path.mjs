export default {
  name: "verify-hos-enforced-on-every-assignment-path",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hos-enforced-on-every-assignment-path.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-hos-enforced-on-every-assignment-path.mjs"]);
  },
};
