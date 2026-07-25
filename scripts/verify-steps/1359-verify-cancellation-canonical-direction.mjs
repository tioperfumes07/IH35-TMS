export default {
  name: "verify:cancellation-canonical-direction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancellation-canonical-direction.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cancellation-canonical-direction.mjs"]);
  },
};
