export default {
  name: "verify:cancelled-load-has-cancellation-record",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancelled-load-has-cancellation-record.mjs"]);
  },
};
