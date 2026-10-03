export default {
  name: "verify:feed-gate-blocks-incomplete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-feed-gate-blocks-incomplete.mjs"]);
  },
};
