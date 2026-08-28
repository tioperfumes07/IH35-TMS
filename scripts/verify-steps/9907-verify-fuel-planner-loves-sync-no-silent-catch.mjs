export default {
  name: "verify:fuel-planner-loves-sync-no-silent-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-planner-loves-sync-no-silent-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-planner-loves-sync-no-silent-catch.mjs"]);
  },
};
