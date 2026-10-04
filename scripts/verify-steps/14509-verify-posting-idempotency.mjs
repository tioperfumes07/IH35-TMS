export default {
  name: "verify:posting-idempotency",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-idempotency.mjs"]);
  },
};
