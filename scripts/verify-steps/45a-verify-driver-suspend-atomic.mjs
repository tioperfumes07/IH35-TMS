export default {
  name: "verify-driver-suspend-atomic",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-suspend-atomic.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
