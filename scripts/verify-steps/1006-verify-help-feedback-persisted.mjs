export default {
  name: "verify:help-feedback-persisted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-help-feedback-persisted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-help-feedback-persisted.mjs"]);
  },
};
