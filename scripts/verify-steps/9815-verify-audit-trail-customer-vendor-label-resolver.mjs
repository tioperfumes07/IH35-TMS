export default {
  name: "verify:audit-trail-customer-vendor-label-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-trail-customer-vendor-label-resolver.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-trail-customer-vendor-label-resolver.mjs"]);
  },
};
