export default {
  name: "verify-home-filings-widget-shows-detail",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-home-filings-widget-shows-detail.mjs"]) !== 0) {
      throw new Error("verify-home-filings-widget-shows-detail failed");
    }
  },
};
