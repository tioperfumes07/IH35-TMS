export default {
  name: "verify:baselines-are-post-wipe",
  run(ctx) {
    ctx.run("node", ["scripts/verify-baselines-are-post-wipe.mjs"]);
  },
};
