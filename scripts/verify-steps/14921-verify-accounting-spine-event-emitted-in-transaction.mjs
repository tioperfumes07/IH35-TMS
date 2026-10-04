export default {
  name: "verify:accounting-spine-event-emitted-in-transaction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-spine-event-emitted-in-transaction.mjs"]);
  },
};
