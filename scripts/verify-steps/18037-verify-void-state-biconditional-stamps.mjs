export default {
  name: "verify:void-state-biconditional-stamps",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-state-biconditional-stamps.mjs"]);
  },
};
