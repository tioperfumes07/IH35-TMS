export default {
  name: "verify:auth-ai-rate-limits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-auth-ai-rate-limits.mjs"]);
  },
};
