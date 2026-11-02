export default {
  name: "verify:insurance-lawsuit-update-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-lawsuit-update-truth.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-lawsuit-update-truth.mjs"]);
  },
};
