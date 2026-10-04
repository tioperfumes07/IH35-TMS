export default {
  name: "verify:abandonment-driver-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-abandonment-driver-picker.mjs"]);
  },
};
