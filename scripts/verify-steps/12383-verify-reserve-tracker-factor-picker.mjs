export default {
  name: "verify:reserve-tracker-factor-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reserve-tracker-factor-picker.mjs"]);
  },
};
