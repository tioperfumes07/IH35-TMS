export default {
  name: "verify:anomaly-medcard-shared-drivers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-anomaly-medcard-shared-drivers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-anomaly-medcard-shared-drivers.mjs"]);
  },
};
