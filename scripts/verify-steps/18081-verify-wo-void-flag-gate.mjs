export default {
  name: "verify:wo-void-flag-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-void-flag-gate.mjs"]);
  },
};
