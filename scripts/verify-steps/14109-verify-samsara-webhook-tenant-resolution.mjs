export default {
  name: "verify:samsara-webhook-tenant-resolution",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-webhook-tenant-resolution.mjs"]);
  },
};
