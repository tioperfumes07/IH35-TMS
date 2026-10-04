export default {
  name: "verify:driver-qualification-update-audit-failure-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-qualification-update-audit-failure-truth.mjs"]);
  },
};
