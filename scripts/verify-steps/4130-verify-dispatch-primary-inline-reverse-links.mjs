export default {
  name: "verify:dispatch-primary-inline-reverse-links",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-primary-inline-reverse-links.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-primary-inline-reverse-links.mjs"]);
    // BANK-F91515 — TripPairingBoard dashed-legend leftover #94a3b8 refuse (unwired EVEN host).
    ctx.run("node", ["scripts/verify-trip-pairing-leg-columns.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-trip-pairing-leg-columns.mjs"]);
  },
};
