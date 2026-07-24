export default {
  name: "verify:driver-load-statuses-per-entity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-load-statuses-per-entity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-load-statuses-per-entity.mjs"]);
  },
};
