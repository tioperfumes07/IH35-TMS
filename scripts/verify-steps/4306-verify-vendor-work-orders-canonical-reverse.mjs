export default {
  name: "verify:vendor-work-orders-canonical-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-work-orders-canonical-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-work-orders-canonical-reverse.mjs"]);
  },
};
