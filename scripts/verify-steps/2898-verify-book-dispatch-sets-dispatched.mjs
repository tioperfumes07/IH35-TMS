export default {
  name: "verify-book-dispatch-sets-dispatched",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-dispatch-sets-dispatched.mjs"]);
  },
};
