export default {
  name: "verify-legal-contract-signer-phone-e164",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-legal-contract-signer-phone-e164.mjs"]) !== 0) {
      throw new Error("verify-legal-contract-signer-phone-e164 failed");
    }
  },
};
