export default {
  name: "verify:bill-detail-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-detail-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bill-detail-url-sort.mjs"]);
  },
};
