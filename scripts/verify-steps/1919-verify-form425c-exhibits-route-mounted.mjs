export default {
  name: "verify-form425c-exhibits-route-mounted",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-form425c-exhibits-route-mounted.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-form425c-exhibits-route-mounted.mjs"]);
  },
};
