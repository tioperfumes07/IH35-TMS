export default {
  name: "verify-bill-detail-reverse",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bill-detail-reverse.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-bill-detail-reverse.mjs", "--selftest"]);
  },
};
