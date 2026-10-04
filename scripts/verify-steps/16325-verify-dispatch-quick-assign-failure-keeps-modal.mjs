export default {
  name: "verify:dispatch-quick-assign-failure-keeps-modal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-quick-assign-failure-keeps-modal.mjs"]);
  },
};
