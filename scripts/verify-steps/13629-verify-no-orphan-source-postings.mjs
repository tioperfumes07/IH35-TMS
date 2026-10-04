export default {
  name: "verify:no-orphan-source-postings",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-orphan-source-postings.mjs"]);
  },
};
