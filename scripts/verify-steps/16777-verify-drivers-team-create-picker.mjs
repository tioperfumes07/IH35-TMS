export default {
  name: "verify:drivers-team-create-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-team-create-picker.mjs"]);
  },
};
