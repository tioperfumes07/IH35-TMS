export default {
  name: "verify:safety-void-requires-reason",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-void-requires-reason.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-void-requires-reason.mjs"]);
  },
};
