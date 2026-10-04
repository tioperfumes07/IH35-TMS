export default {
  name: "verify:fuel-planner-settings-write-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-planner-settings-write-identity.mjs"]);
  },
};
