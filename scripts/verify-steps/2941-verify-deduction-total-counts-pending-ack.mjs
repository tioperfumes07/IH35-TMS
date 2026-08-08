export default {
  name: "verify:deduction-total-counts-pending-ack",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deduction-total-counts-pending-ack.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-deduction-total-counts-pending-ack.mjs"]);
  },
};
