export default {
  name: "verify:scheduled-engine-idempotency-header",
  run(ctx) {
    ctx.run("node", ["scripts/verify-scheduled-engine-idempotency-header.mjs"]);
  },
};
