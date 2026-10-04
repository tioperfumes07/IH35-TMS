export default {
  name: "verify:fuel-planner-settings-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-planner-settings-company-lifecycle.mjs"]);
  },
};
