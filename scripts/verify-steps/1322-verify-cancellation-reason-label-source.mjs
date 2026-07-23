export default {
  name: "verify:cancellation-reason-label-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancellation-reason-label-source.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cancellation-reason-label-source.mjs"]);
  },
};
