export default {
  name: "verify:receipts-integration-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-receipts-integration-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-receipts-integration-url-sort.mjs"]);
  },
};
