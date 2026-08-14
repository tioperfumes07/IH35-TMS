// LINK-F5177 / LINK-F5171 — banking:driver_escrow reverse deep-link
// (verify-step 3289 — CC-1 band, claimed in #6754).
export default {
  name: "banking-driver-escrow-reverse-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-driver-escrow-reverse-link.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-banking-driver-escrow-reverse-link.mjs"]);
  },
};
