export default {
  name: "verify:void-header-matches-postings",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-header-matches-postings.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-void-header-matches-postings.mjs"]);
  },
};
