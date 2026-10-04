export default {
  name: "verify:accounting-hub-find-transactions-vendor-name",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-hub-find-transactions-vendor-name.mjs"]);
  },
};
