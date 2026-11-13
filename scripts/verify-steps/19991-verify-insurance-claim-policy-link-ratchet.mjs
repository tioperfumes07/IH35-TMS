export default {
  name: "verify:insurance-claim-policy-link-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-claim-policy-link-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-claim-policy-link-ratchet.mjs"]);
  },
};
