export default {
  name: "verify:vehicle-driver-history-shared-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-driver-history-shared-label.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vehicle-driver-history-shared-label.mjs"]);
  },
};
