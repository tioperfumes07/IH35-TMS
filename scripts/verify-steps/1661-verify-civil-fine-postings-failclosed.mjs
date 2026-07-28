export default {
  name: "verify-civil-fine-postings-failclosed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-civil-fine-postings-failclosed.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-civil-fine-postings-failclosed.mjs"]);
  },
};
