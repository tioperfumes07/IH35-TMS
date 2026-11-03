export default {
  name: "verify:safety-settings-trigger-secdef",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-settings-trigger-secdef.mjs"]);
  },
};
