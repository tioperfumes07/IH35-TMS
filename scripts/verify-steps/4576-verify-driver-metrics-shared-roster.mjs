export default {
  name: "verify:driver-metrics-shared-roster",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-metrics-shared-roster.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-metrics-shared-roster.mjs"]);
  },
};
