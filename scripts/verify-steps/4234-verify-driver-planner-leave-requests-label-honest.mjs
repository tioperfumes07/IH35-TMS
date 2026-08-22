export default {
  name: "verify:driver-planner-leave-requests-label-honest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-planner-leave-requests-label-honest.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-planner-leave-requests-label-honest.mjs"]);
  },
};
