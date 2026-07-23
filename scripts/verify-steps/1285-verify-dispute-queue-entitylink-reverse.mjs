export default {
  name: "verify-dispute-queue-entitylink-reverse",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-dispute-queue-entitylink-reverse.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-dispute-queue-entitylink-reverse.mjs", "--selftest"]);
  },
};
