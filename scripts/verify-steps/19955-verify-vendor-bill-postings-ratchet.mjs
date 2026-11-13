export default {
  name: "verify:verify-vendor-bill-postings-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-bill-postings-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-bill-postings-ratchet.mjs"]);
  },
};
