export default {
  name: "verify:factoring-invoice-detail-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-invoice-detail-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-invoice-detail-url-sort.mjs"]);
  },
};
