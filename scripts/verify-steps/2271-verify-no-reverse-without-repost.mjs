export default {
  name: "verify-no-reverse-without-repost",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-reverse-without-repost.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-reverse-without-repost.mjs"]);
  },
};
