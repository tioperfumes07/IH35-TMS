export default {
  name: "verify:dtc-auto-work-orders-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dtc-auto-work-orders-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dtc-auto-work-orders-range.mjs"]);
  },
};
