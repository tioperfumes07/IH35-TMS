export default {
  name: "verify-fmcsa-fire-and-forget-retry",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-fmcsa-fire-and-forget-retry.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-fmcsa-fire-and-forget-retry.mjs", "--selftest"]) !== 0) {
      process.exit(1);
    }
  },
};
