export default {
  name: "verify:lists-hub-driver-load-statuses",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-hub-driver-load-statuses.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-lists-hub-driver-load-statuses.mjs"]);
  },
};
