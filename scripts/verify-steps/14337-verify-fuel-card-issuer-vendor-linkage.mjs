export default {
  name: "verify:fuel-card-issuer-vendor-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-card-issuer-vendor-linkage.mjs"]);
  },
};
