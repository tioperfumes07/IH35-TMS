export default {
  name: "verify-go26-consolidation-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-go26-consolidation-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-go26-consolidation-ratchet.mjs"]);
  },
};
