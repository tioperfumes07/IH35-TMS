export default {
  name: "verify:samsara-projection-idempotent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-projection-idempotent.mjs"]);
  },
};
