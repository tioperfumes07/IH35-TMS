// LINK-F5175 / LINK-F5171 — bank account reconciliation-session reverse surface
// (verify-step 3285 — CC-1 band, claimed in #6748).
export default {
  name: "bank-account-reconciliation-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-account-reconciliation-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-account-reconciliation-reverse-section.mjs"]);
  },
};
