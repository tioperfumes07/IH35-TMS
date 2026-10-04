export default {
  name: "verify:je-void-money-control-flag-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-je-void-money-control-flag-gate.mjs"]);
  },
};
