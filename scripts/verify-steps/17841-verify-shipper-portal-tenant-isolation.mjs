export default {
  name: "verify:shipper-portal-tenant-isolation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-shipper-portal-tenant-isolation.mjs"]);
  },
};
