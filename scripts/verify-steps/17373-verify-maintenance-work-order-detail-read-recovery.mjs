export default {
  name: "verify:maintenance-work-order-detail-read-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-work-order-detail-read-recovery.mjs"]);
  },
};
