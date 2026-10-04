export default {
  name: "verify:migration-idempotency",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-idempotency.mjs"]);
  },
};
