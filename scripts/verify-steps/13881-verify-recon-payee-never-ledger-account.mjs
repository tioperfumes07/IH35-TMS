export default {
  name: "verify:recon-payee-never-ledger-account",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recon-payee-never-ledger-account.mjs"]);
  },
};
