export default {
  name: "verify:bank-recon-poster-ledger-account-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-recon-poster-ledger-account-id.mjs"]);
  },
};
