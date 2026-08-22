export default {
  name: "verify:factoring-void-reverses-funding-je",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-void-reverses-funding-je.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-void-reverses-funding-je.mjs"]);
  },
};
