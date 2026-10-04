export default {
  name: "verify:e10-reversal-is-idempotent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-e10-reversal-is-idempotent.mjs"]);
  },
};
