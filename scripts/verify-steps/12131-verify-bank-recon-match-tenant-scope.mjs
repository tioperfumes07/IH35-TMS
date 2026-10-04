export default {
  name: "verify:bank-recon-match-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-recon-match-tenant-scope.mjs"]);
  },
};
