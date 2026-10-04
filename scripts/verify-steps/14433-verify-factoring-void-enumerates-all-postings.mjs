export default {
  name: "verify:factoring-void-enumerates-all-postings",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-void-enumerates-all-postings.mjs"]);
  },
};
