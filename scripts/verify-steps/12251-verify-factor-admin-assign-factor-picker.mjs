export default {
  name: "verify:factor-admin-assign-factor-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factor-admin-assign-factor-picker.mjs"]);
  },
};
