export default {
  name: "verify:vendor-type-app-db-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-type-app-db-parity.mjs"]);
  },
};
