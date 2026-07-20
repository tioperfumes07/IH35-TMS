export default {
  name: "verify:fuel-fraud-detector-worker-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-fraud-detector-worker-registered.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-fraud-detector-worker-registered.mjs"]);
  },
};
