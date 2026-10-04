export default {
  name: "verify:bank-recon-ui-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-recon-ui-tenant-scope.mjs"]);
  },
};
