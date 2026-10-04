export default {
  name: "verify:dispatch-primary-inline-reverse-links",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-primary-inline-reverse-links.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-primary-inline-reverse-links.mjs"]);
    // BANK-F91515 leftover muted + BANK-F91546 leftover slate class refuse.
    ctx.run("node", ["scripts/verify-trip-pairing-leg-columns.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-trip-pairing-leg-columns.mjs"]);
  },
};
