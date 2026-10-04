export default {
  name: "verify:fuel-planner-send-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-planner-send-company-lifecycle.mjs"]);
  },
};
