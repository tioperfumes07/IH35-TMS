export default {
  name: "verify:je-void-reverses-not-voids",
  run(ctx) {
    ctx.run("node", ["scripts/verify-je-void-reverses-not-voids.mjs"]);
  },
};
