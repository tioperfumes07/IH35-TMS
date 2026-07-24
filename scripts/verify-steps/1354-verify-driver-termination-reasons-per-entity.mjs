export default {
  name: "verify:driver-termination-reasons-per-entity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-termination-reasons-per-entity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-termination-reasons-per-entity.mjs"]);
  },
};
