export default {
  name: "verify:driver-prompts-flag-off-idempotent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-prompts-flag-off-idempotent.mjs"]);
  },
};
