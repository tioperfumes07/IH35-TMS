export default {
  name: "verify:verify-settlements-paid-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-paid-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlements-paid-ratchet.mjs"]);
  },
};
