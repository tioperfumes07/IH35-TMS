export default {
  name: "verify-je-detail-source-links",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-je-detail-source-links.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-je-detail-source-links.mjs", "--selftest"]);
  },
};
