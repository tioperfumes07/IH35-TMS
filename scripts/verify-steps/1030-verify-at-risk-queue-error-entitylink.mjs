export default {
  name: "verify:at-risk-queue-error-entitylink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-at-risk-queue-error-entitylink.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-at-risk-queue-error-entitylink.mjs"]);
  },
};
