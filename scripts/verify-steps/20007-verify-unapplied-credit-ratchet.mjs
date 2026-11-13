export default {
  name: "verify:unapplied-credit-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unapplied-credit-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unapplied-credit-ratchet.mjs"]);
  },
};
