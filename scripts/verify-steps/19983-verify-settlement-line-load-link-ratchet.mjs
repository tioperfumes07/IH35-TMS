export default {
  name: "verify:settlement-line-load-link-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-line-load-link-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-line-load-link-ratchet.mjs"]);
  },
};
