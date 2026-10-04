export default {
  name: "verify:maintenance-vendor-history-exact-range-vertical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-vendor-history-exact-range-vertical.mjs"]);
  },
};
