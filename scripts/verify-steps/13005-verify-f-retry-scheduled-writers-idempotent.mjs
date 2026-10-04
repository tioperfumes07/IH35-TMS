export default {
  name: "verify:f-retry-scheduled-writers-idempotent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-f-retry-scheduled-writers-idempotent.mjs"]);
  },
};
