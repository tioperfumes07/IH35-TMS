export default {
  name: "verify:dispatch-blocker-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-blocker-labels.mjs"]);
  },
};
