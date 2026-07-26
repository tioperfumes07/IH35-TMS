export default {
  name: "verify:mnt-link-04-maintenance-vendor-ap",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-mnt-link-04-maintenance-vendor-ap.mjs"]);
  },
};
