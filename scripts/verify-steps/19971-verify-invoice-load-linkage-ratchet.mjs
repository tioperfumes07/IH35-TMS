export default {
  name: "verify:invoice-load-linkage-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-load-linkage-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-invoice-load-linkage-ratchet.mjs"]);
  },
};
