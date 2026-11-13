export default {
  name: "verify:test-records-purge-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-test-records-purge-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-test-records-purge-ratchet.mjs"]);
  },
};
