export default {
  name: "verify:driver-vendor-snapshot-company-isolation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-vendor-snapshot-company-isolation.mjs"]);
  },
};
