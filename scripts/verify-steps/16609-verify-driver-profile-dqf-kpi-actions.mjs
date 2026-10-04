export default {
  name: "verify:driver-profile-dqf-kpi-actions",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-dqf-kpi-actions.mjs"]);
  },
};
