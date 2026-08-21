export default {
  name: "verify:maintenance-paid-same-day-gl-and-no-double-bill",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-paid-same-day-gl-and-no-double-bill.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-paid-same-day-gl-and-no-double-bill.mjs"]);
  },
};
