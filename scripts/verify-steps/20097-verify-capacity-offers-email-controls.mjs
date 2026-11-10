export default {
  name: "verify:capacity-offers-email-controls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-capacity-offers-email-controls.mjs"]);
    ctx.run("node", ["scripts/verify-capacity-offers-email-controls.mjs", "--selftest"]);
  },
};
