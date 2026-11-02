export default {
  name: "verify:fuel-planner-source-availability",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-planner-source-availability.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-planner-source-availability.mjs"]);
  },
};
