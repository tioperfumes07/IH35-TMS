export default {
  name: "verify:driver-bill-load-link-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-bill-load-link-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-bill-load-link-ratchet.mjs"]);
  },
};
