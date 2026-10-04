export default {
  name: "verify:fuel-planner-active-driver-compliance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-planner-active-driver-compliance.mjs"]);
  },
};
