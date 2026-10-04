export default {
  name: "verify:fault-auto-wo-idempotency",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fault-auto-wo-idempotency.mjs"]);
  },
};
