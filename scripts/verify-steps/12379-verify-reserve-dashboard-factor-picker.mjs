export default {
  name: "verify:reserve-dashboard-factor-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reserve-dashboard-factor-picker.mjs"]);
  },
};
