export default {
  name: "verify:fuel-stop-planner-uses-cap-hos",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-stop-planner-uses-cap-hos.mjs"]);
  },
};
