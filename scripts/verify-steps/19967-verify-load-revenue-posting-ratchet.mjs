export default {
  name: "verify:verify-load-revenue-posting-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-revenue-posting-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-revenue-posting-ratchet.mjs"]);
  },
};
