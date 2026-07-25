export default {
  name: "verify:dispatcher-error-reasons-per-entity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatcher-error-reasons-per-entity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-dispatcher-error-reasons-per-entity.mjs"]);
  },
};
