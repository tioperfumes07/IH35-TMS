export default {
  name: "verify:relay-fill-recorded-at-receipt",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-fill-recorded-at-receipt.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-fill-recorded-at-receipt.mjs"]);
  },
};
