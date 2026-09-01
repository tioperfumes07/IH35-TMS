export default {
  name: "verify-mdp-panel-proportion",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-mdp-panel-proportion.mjs"]);
  },
};
