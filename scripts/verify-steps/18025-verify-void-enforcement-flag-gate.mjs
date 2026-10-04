export default {
  name: "verify:void-enforcement-flag-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-enforcement-flag-gate.mjs"]);
  },
};
