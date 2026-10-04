export default {
  name: "verify:match-posts-nothing",
  run(ctx) {
    ctx.run("node", ["scripts/verify-match-posts-nothing.mjs"]);
  },
};
